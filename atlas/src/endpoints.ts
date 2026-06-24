/**
 * @file Atlas HTTP + WebSocket endpoint table — the worker's whole routing surface, in one place.
 *
 * Each entry is a declarative `endpoint(path).method(handler)` / `authed(path).method(handler)` from
 * `@moku-labs/worker`, grouped by resource (health · auth · departments · boards · columns · issues ·
 * sub-issues · attachments · customize · activity · live). Handlers are deliberately thin: read
 * `ctx.params` / `ctx.request` / `ctx.env`, read the acting `ctx.user` for mutations (provided by the
 * `authed` guard), delegate to a plugin via `ctx.require`, and return a `Response`. Every D1 / KV / Queues / R2 /
 * Durable-Object side effect — and every `realtime.broadcast` / `ctx.emit` — lives inside those
 * plugins, never here.
 *
 * **Cross-plugin view-models are assembled HERE, not in a plugin** (spec/12 §"Consumer API surface"):
 * `GET /api/departments` merges `departments.list` + `customize.getCustomizationsForChrome`
 * into a `DepartmentsIndex`; `GET /api/boards/{id}` merges `boards.getBoardWithColumns` +
 * `issues.listForBoard` + `attachments.listForBoard` + `customize.getCustomizationsForBoard` into one
 * `BoardSnapshot` (the realtime seed). This is why `boards`/`departments` do not depend on `customize`.
 *
 * `src/server.ts` consumes this array as `server: { endpoints }` and `server.server.handle` dispatches
 * it (most-specific path wins). **Auth is enforced HERE, in the table**: protected routes are built with
 * `authed` (= `endpoint.new(authGuard)`), whose guard 401s unless a valid session resolves — so the
 * Cloudflare adapter no longer prefix-guards `/api/*` + `/ws/*`. The public `/health` + `/api/auth/*`
 * routes use the bare `endpoint`. The guard resolves the session ONCE and enriches the context with the
 * acting `ctx.user` (worker guard enrichment), so mutating handlers read it directly for attribution —
 * no re-resolve, no per-handler 401 re-check, no defensive null-check. Each comment states three things:
 *   • expects — path params / request body / headers the handler reads
 *   • does    — the one-line action (the header line after the method + path)
 *   • returns — status code + JSON/stream shape on success (and notable error statuses)
 */

import type { Server } from "@moku-labs/worker";
import { durableObjectsPlugin, endpoint } from "@moku-labs/worker";
import { DEFAULT_CONTENT_TYPE, DEFAULT_FILENAME, isInlineSafe } from "./lib/attachments";
import { badRequest, noContent, notFound, unauthorized } from "./lib/http";
import { clearedSessionCookie, sessionCookie, tokenFromRequest } from "./lib/session";
import type {
  BoardSnapshot,
  Credentials,
  CustomizationInput,
  DepartmentsIndex,
  IssueDetail,
  IssueMove,
  IssuePatch,
  NewBoard,
  NewColumn,
  NewDepartment,
  NewIssue,
  NewSubIssue,
  ProfileInput
} from "./lib/types";
import { activityPlugin } from "./plugins/activity";
import { attachmentsPlugin } from "./plugins/attachments";
import { authPlugin } from "./plugins/auth";
import { boardsPlugin } from "./plugins/boards";
import { customizePlugin } from "./plugins/customize";
import { departmentsPlugin } from "./plugins/departments";
import { issuesPlugin } from "./plugins/issues";
import { usersPlugin } from "./plugins/users";

/** The rail-property keys of an {@link IssuePatch} — everything except the article body (title/description). */
const RAIL_PATCH_KEYS = [
  "status",
  "priority",
  "estimate",
  "dueAt",
  "milestone",
  "reporterId",
  "labels",
  "assignees"
] as const satisfies readonly (keyof IssuePatch)[];

/**
 * The auth gate for every protected route — the declarative replacement for the old
 * `cloudflare/worker.ts` prefix-guard. `authed(path)` is `endpoint(path)` plus a guard that
 * 401s unless the request carries a valid session (`auth.isAuthed`); chain `.new` to stack more
 * guards. Public routes (`/health`, `/api/auth/*`) stay on the bare `endpoint`.
 *
 * @example
 * ```ts
 * authed("/api/users").get(async ctx => Response.json(await ctx.require(usersPlugin).list(ctx.env)));
 * ```
 */
const authed = endpoint.new(async ctx => {
  // Resolve the session ONCE: gate if absent (401), else hand the acting user to the handler as a
  // typed `ctx.user` (worker ≥ 0.15.0 guard enrichment). `resolveActor` gates identically to the old
  // `isAuthed` check (both: token → session), so the behaviour is unchanged — but the handler no longer
  // re-resolves the user or null-checks it (the old `actorOf` helper + its defensive throw are gone).
  const user = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
  if (!user) return unauthorized();
  return { user };
});

/**
 * The Atlas endpoint table, grouped by resource. Wired into the worker app via `server: { endpoints }`
 * and dispatched by `server.server.handle`. See the file header for the per-endpoint comment
 * convention and where the `BoardSnapshot` / `DepartmentsIndex` view-models are assembled.
 *
 * @example
 * ```ts
 * import { endpoints } from "./endpoints";
 * createApp({ pluginConfigs: { server: { endpoints } } });
 * ```
 */
export const endpoints: Server.Endpoint[] = [
  // ── Health ──────────────────────────────────────────────────────────────
  // GET /health — liveness probe.
  //   expects : —
  //   returns : 200 · text/plain "ok"
  endpoint("/health").get(() => new Response("ok")),

  // ── Auth (public — built with bare `endpoint`, never `authed`) ──
  // POST /api/auth/signin — validate credential SHAPE only, mint a KV session.
  //   expects : JSON body Credentials { email, password }
  //   returns : 201 · Session { userId, name, email, token, expiresAt }   ·   400 on bad shape
  endpoint("/api/auth/signin").post(async ctx => {
    const credentials = (await ctx.request.json()) as Credentials;
    try {
      const session = await ctx.require(authPlugin).signIn(ctx.env, credentials);
      return Response.json(session, {
        status: 201,
        headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) }
      });
    } catch {
      return badRequest("invalid credentials");
    }
  }),
  // POST /api/auth/signup — like signin, but records the supplied display name.
  //   expects : JSON body Credentials { email, password, name? }
  //   returns : 201 · Session   ·   400 on bad shape
  endpoint("/api/auth/signup").post(async ctx => {
    const credentials = (await ctx.request.json()) as Credentials;
    try {
      const session = await ctx.require(authPlugin).signUp(ctx.env, credentials);
      return Response.json(session, {
        status: 201,
        headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) }
      });
    } catch {
      return badRequest("invalid credentials");
    }
  }),
  // POST /api/auth/signout — invalidate the bearer/cookie session (idempotent).
  //   expects : Authorization: Bearer <token>  OR  the session cookie
  //   returns : 204 · empty   (deleting an absent key is a no-op)
  endpoint("/api/auth/signout").post(async ctx => {
    const auth = ctx.require(authPlugin);
    const session = await auth.resolveActor(ctx.request, ctx.env);
    if (session) {
      const token = tokenFromRequest(ctx.request);
      if (token) await auth.signOut(ctx.env, token);
    }
    return new Response(undefined, {
      status: 204,
      headers: { "set-cookie": clearedSessionCookie() }
    });
  }),
  // GET /api/auth/session — the current Actor for the request, or 401 when unauthenticated.
  //   expects : Authorization: Bearer <token>  OR  the session cookie
  //   returns : 200 · Actor { id, name }   ·   401 when no valid session
  //   PUBLIC probe: stays on `endpoint` and resolves its own user so a logged-out caller gets a
  //   graceful 401 (not a guard short-circuit) — this is how the SPA asks "am I signed in?".
  endpoint("/api/auth/session").get(async ctx => {
    const user = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!user) return unauthorized();
    return Response.json(user);
  }),

  // ── Departments ─────────────────────────────────────────────────────────
  // GET /api/departments — the DepartmentsIndex (departments + their customizations).
  //   expects : —
  //   returns : 200 · DepartmentsIndex   (VIEW-MODEL assembled here: list + dept customizations)
  authed("/api/departments").get(async ctx => {
    const [departments, customizations] = await Promise.all([
      ctx.require(departmentsPlugin).list(ctx.env),
      // Chrome customizations = departments + boards, so the boards-bar pills tint too (not just tabs).
      ctx.require(customizePlugin).getCustomizationsForChrome(ctx.env)
    ]);
    const index: DepartmentsIndex = { departments, customizations };
    return Response.json(index);
  }),
  // POST /api/departments — create a department at the next free position.
  //   expects : JSON body NewDepartment { title }
  //   returns : 201 · Department   ·   401 when no user
  authed("/api/departments").post(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as NewDepartment;
    const dept = await ctx.require(departmentsPlugin).create(ctx.env, input, user);
    return Response.json(dept, { status: 201 });
  }),
  // POST /api/departments/reorder — move a department to a new index (re-packs siblings).
  //   expects : JSON body { id, position }
  //   returns : 204 · empty   ·   401 when no user
  // NOTE: declared BEFORE /api/departments/{id} so the literal path wins the specificity match.
  authed("/api/departments/reorder").post(async ctx => {
    const { user } = ctx;
    const { id, position } = (await ctx.request.json()) as { id: string; position: number };
    await ctx.require(departmentsPlugin).reorder(ctx.env, id, position, user);
    return noContent();
  }),
  // PATCH /api/departments/{id} — rename a department.
  //   expects : path {id} · JSON body { title }
  //   returns : 200 · Department   ·   401 when no user   ·   404 when the id is unknown
  authed("/api/departments/{id}").patch(async ctx => {
    const { user } = ctx;
    const { title } = (await ctx.request.json()) as { title: string };
    try {
      return Response.json(
        await ctx.require(departmentsPlugin).rename(ctx.env, ctx.params.id, title, user)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/departments/{id} — delete a department + its cascade subtree (R2 purge first).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no user
  authed("/api/departments/{id}").delete(async ctx => {
    const { user } = ctx;
    await ctx.require(departmentsPlugin).delete(ctx.env, ctx.params.id, user);
    return noContent();
  }),
  // GET /api/departments/{id}/boards — the department's board summaries (KV-indexed, D1 fallback).
  //   expects : path {id}
  //   returns : 200 · BoardSummary[]   (the boards-bar listing + the home default-board resolution)
  // NOTE: more specific than /api/departments/{id}, so the literal `/boards` suffix wins the match.
  authed("/api/departments/{id}/boards").get(async ctx =>
    Response.json(await ctx.require(boardsPlugin).listForDepartment(ctx.env, ctx.params.id))
  ),

  // ── Boards ──────────────────────────────────────────────────────────────
  // POST /api/boards — create a board (seeds the 4 default columns) + re-warm the KV index.
  //   expects : JSON body NewBoard { departmentId, title, standfirst?, eyebrow? }
  //   returns : 201 · Board   ·   401 when no user
  authed("/api/boards").post(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as NewBoard;
    const board = await ctx.require(boardsPlugin).create(ctx.env, input, user);
    return Response.json(board, { status: 201 });
  }),
  // POST /api/boards/reorder — move a board within its department (re-packs siblings).
  //   expects : JSON body { id, position }
  //   returns : 204 · empty   ·   401 when no user
  // NOTE: declared BEFORE /api/boards/{id} so the literal path wins the specificity match.
  authed("/api/boards/reorder").post(async ctx => {
    const { user } = ctx;
    const { id, position } = (await ctx.request.json()) as { id: string; position: number };
    await ctx.require(boardsPlugin).reorder(ctx.env, id, position, user);
    return noContent();
  }),
  // GET /api/boards/{id} — the full BoardSnapshot (the realtime seed).
  //   expects : path {id}
  //   returns : 200 · BoardSnapshot   ·   404 when the board is unknown
  //   VIEW-MODEL assembled here: board+columns ⊕ issues slice ⊕ attachments ⊕ customizations.
  authed("/api/boards/{id}").get(async ctx => {
    const boardId = ctx.params.id;
    const base = await ctx.require(boardsPlugin).getBoardWithColumns(ctx.env, boardId);
    if (!base) return notFound();

    const [slice, attachments, customizations] = await Promise.all([
      ctx.require(issuesPlugin).listForBoard(ctx.env, boardId),
      ctx.require(attachmentsPlugin).listForBoard(ctx.env, boardId),
      ctx.require(customizePlugin).getCustomizationsForBoard(ctx.env, boardId)
    ]);

    const snapshot: BoardSnapshot = {
      board: base.board,
      columns: base.columns,
      issues: slice.issues,
      subIssues: slice.subIssues,
      labels: slice.labels,
      assignees: slice.assignees,
      attachments,
      customizations
    };
    return Response.json(snapshot);
  }),
  // GET /api/boards/{id}/milestones — the board's milestone catalog (distinct issue milestones).
  //   returns : 200 · string[]
  //   NOTE: more specific than /api/boards/{id}, so the literal `/milestones` suffix wins the match.
  authed("/api/boards/{id}/milestones").get(async ctx =>
    Response.json(await ctx.require(issuesPlugin).listMilestones(ctx.env, ctx.params.id))
  ),
  // POST /api/boards/{id}/milestones/rename — rename a milestone board-wide.
  //   expects : path {id} · JSON body { from, to }   ·   returns : 204 · empty   ·   401 when no user
  authed("/api/boards/{id}/milestones/rename").post(async ctx => {
    const { user } = ctx;
    const { from, to } = (await ctx.request.json()) as { from: string; to: string };
    if (!from || !to) return badRequest("from and to are required");
    await ctx.require(issuesPlugin).renameMilestone(ctx.env, ctx.params.id, from, to, user);
    return new Response(undefined, { status: 204 });
  }),
  // POST /api/boards/{id}/milestones/delete — delete a milestone board-wide (clears it on every issue).
  //   expects : path {id} · JSON body { name }   ·   returns : 204 · empty   ·   401 when no user
  authed("/api/boards/{id}/milestones/delete").post(async ctx => {
    const { user } = ctx;
    const { name } = (await ctx.request.json()) as { name: string };
    if (!name) return badRequest("name is required");
    await ctx.require(issuesPlugin).deleteMilestone(ctx.env, ctx.params.id, name, user);
    return new Response(undefined, { status: 204 });
  }),
  // PATCH /api/boards/{id} — rename a board + edit its subtitle (broadcasts board.renamed).
  //   expects : path {id} · JSON body { title, standfirst? }
  //   returns : 200 · Board   ·   401 when no user   ·   404 when the id is unknown
  authed("/api/boards/{id}").patch(async ctx => {
    const { user } = ctx;
    const { title, standfirst } = (await ctx.request.json()) as {
      title: string;
      standfirst?: string;
    };
    try {
      return Response.json(
        await ctx.require(boardsPlugin).rename(ctx.env, ctx.params.id, title, user, standfirst)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/boards/{id} — delete a board + its cascade subtree (R2 purge first, then broadcast).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no user
  authed("/api/boards/{id}").delete(async ctx => {
    const { user } = ctx;
    await ctx.require(boardsPlugin).delete(ctx.env, ctx.params.id, user);
    return noContent();
  }),

  // ── Columns ─────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/columns — append a column to a board (broadcasts column.created).
  //   expects : path {id} · JSON body NewColumn { title }
  //   returns : 201 · Column   ·   401 when no user
  authed("/api/boards/{id}/columns").post(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as NewColumn;
    const column = await ctx
      .require(boardsPlugin)
      .createColumn(ctx.env, ctx.params.id, input, user);
    return Response.json(column, { status: 201 });
  }),
  // POST /api/boards/{id}/columns/reorder — move a column within a board (broadcasts column.reordered).
  //   expects : path {id} · JSON body { columnId, position }
  //   returns : 204 · empty   ·   401 when no user
  // NOTE: declared BEFORE /api/boards/{id}/columns/{cid} so the literal path wins.
  authed("/api/boards/{id}/columns/reorder").post(async ctx => {
    const { user } = ctx;
    const { columnId, position } = (await ctx.request.json()) as {
      columnId: string;
      position: number;
    };
    await ctx.require(boardsPlugin).reorderColumn(ctx.env, ctx.params.id, columnId, position, user);
    return noContent();
  }),
  // PATCH /api/boards/{id}/columns/{cid} — rename a column (broadcasts column.renamed).
  //   expects : path {id, cid} · JSON body { title }
  //   returns : 200 · Column   ·   401 when no user   ·   404 when the column is unknown
  authed("/api/boards/{id}/columns/{cid}").patch(async ctx => {
    const { user } = ctx;
    const { title } = (await ctx.request.json()) as { title: string };
    try {
      return Response.json(
        await ctx
          .require(boardsPlugin)
          .renameColumn(ctx.env, ctx.params.id, ctx.params.cid, title, user)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/boards/{id}/columns/{cid} — delete a column + its cascade subtree (R2 purge first).
  //   expects : path {id, cid}
  //   returns : 204 · empty   ·   401 when no user
  authed("/api/boards/{id}/columns/{cid}").delete(async ctx => {
    const { user } = ctx;
    await ctx.require(boardsPlugin).deleteColumn(ctx.env, ctx.params.id, ctx.params.cid, user);
    return noContent();
  }),

  // ── Issues ──────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/columns/{cid}/issues — create an issue in a column (broadcasts issue.created).
  //   expects : path {id, cid} · JSON body NewIssue { title, description? }
  //   returns : 201 · Issue   ·   401 when no user
  authed("/api/boards/{id}/columns/{cid}/issues").post(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as NewIssue;
    const issue = await ctx
      .require(issuesPlugin)
      .create(ctx.env, ctx.params.id, ctx.params.cid, input, user);
    return Response.json(issue, { status: 201 });
  }),
  // GET /api/issues/{id} — full IssueDetail (issue + sub-issues + labels + assignees + attachments).
  //   expects : path {id}
  //   returns : 200 · IssueDetail   ·   404 when the issue is unknown
  //   VIEW-MODEL: the plugin's getDetail returns attachments:[]; merge the real list here.
  authed("/api/issues/{id}").get(async ctx => {
    const detail = await ctx.require(issuesPlugin).getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const attachments = await ctx.require(attachmentsPlugin).listForIssue(ctx.env, ctx.params.id);
    const merged: IssueDetail = { ...detail, attachments };
    return Response.json(merged);
  }),
  // PATCH /api/issues/{id} — patch the article body (title/description) AND/OR the rail properties.
  //   expects : path {id} · JSON body IssuePatch (body fields and/or scalar/label/assignee sets)
  //   returns : 200 · Issue   ·   401 when no user   ·   404 when the issue is unknown
  //   Body fields (title/description) route to `issues.update`; rail fields to `issues.setProperties`
  //   — the two write distinct columns and broadcast distinct patches, so a mixed patch runs both.
  authed("/api/issues/{id}").patch(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const patch = (await ctx.request.json()) as IssuePatch;
    const boardId = detail.issue.boardId;

    // Body fields (title/description) persist via `update`; everything else via `setProperties`.
    const hasBody = patch.title !== undefined || patch.description !== undefined;
    const hasRail = RAIL_PATCH_KEYS.some(key => patch[key] !== undefined);

    let issue = detail.issue;
    if (hasBody) issue = await issues.update(ctx.env, boardId, ctx.params.id, patch, user);
    if (hasRail) issue = await issues.setProperties(ctx.env, boardId, ctx.params.id, patch, user);
    return Response.json(issue);
  }),
  // DELETE /api/issues/{id} — delete an issue (R2 purge first, then broadcast issue.deleted).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no user   ·   404 when the issue is unknown
  authed("/api/issues/{id}").delete(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    await issues.delete(ctx.env, detail.issue.boardId, ctx.params.id, user);
    return noContent();
  }),
  // POST /api/issues/{id}/move — move an issue to a target column + position + status (broadcasts issue.moved).
  //   expects : path {id} · JSON body IssueMove { toColumnId, position, status }
  //   returns : 200 · Issue   ·   401 when no user   ·   404 when the issue is unknown
  authed("/api/issues/{id}/move").post(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const move = (await ctx.request.json()) as IssueMove;
    const issue = await issues.move(ctx.env, detail.issue.boardId, ctx.params.id, move, user);
    return Response.json(issue);
  }),

  // ── Sub-issues (the issue checklist) ────────────────────────────────────
  // POST /api/issues/{id}/sub-issues — add a checklist sub-issue (broadcasts subIssue.added).
  //   expects : path {id} · JSON body NewSubIssue { title }
  //   returns : 201 · SubIssue   ·   401 when no user   ·   404 when the parent issue is unknown
  authed("/api/issues/{id}/sub-issues").post(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const input = (await ctx.request.json()) as NewSubIssue;
    const sub = await issues.addSubIssue(ctx.env, detail.issue.boardId, ctx.params.id, input, user);
    return Response.json(sub, { status: 201 });
  }),
  // PATCH /api/issues/{id}/sub-issues/{sid} — toggle a sub-issue's done state (broadcasts subIssue.toggled).
  //   expects : path {id, sid} · JSON body { done }
  //   returns : 204 · empty   ·   401 when no user   ·   404 when the parent issue is unknown
  authed("/api/issues/{id}/sub-issues/{sid}").patch(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const { done } = (await ctx.request.json()) as { done: boolean };
    await issues.toggleSubIssue(
      ctx.env,
      detail.issue.boardId,
      ctx.params.id,
      ctx.params.sid,
      done,
      user
    );
    return noContent();
  }),
  // DELETE /api/issues/{id}/sub-issues/{sid} — remove a sub-issue (broadcasts subIssue.removed).
  //   expects : path {id, sid}
  //   returns : 204 · empty   ·   401 when no user   ·   404 when the parent issue is unknown
  authed("/api/issues/{id}/sub-issues/{sid}").delete(async ctx => {
    const { user } = ctx;
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    await issues.removeSubIssue(ctx.env, detail.issue.boardId, ctx.params.id, ctx.params.sid, user);
    return noContent();
  }),

  // ── Attachments (R2 blob + D1 metadata) ─────────────────────────────────
  // POST /api/issues/{id}/attachments — upload an attachment to an issue (multipart; broadcasts attachment.added).
  //   expects : path {id} · multipart/form-data with a `file` part
  //   returns : 201 · Attachment   ·   400 when no file part   ·   401 when no user   ·   404 when the issue is unknown
  //   The full AttachmentScope is composed here: issueId+columnId+boardId from the issue,
  //   departmentId from its board.
  authed("/api/issues/{id}/attachments").post(async ctx => {
    const { user } = ctx;

    const detail = await ctx.require(issuesPlugin).getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();

    const board = await ctx
      .require(boardsPlugin)
      .getBoardWithColumns(ctx.env, detail.issue.boardId);
    if (!board) return notFound();

    const form = await ctx.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("missing file part");

    const attachment = await ctx.require(attachmentsPlugin).add(
      ctx.env,
      {
        issueId: detail.issue.id,
        columnId: detail.issue.columnId,
        boardId: detail.issue.boardId,
        departmentId: board.board.departmentId
      },
      {
        filename: file.name || DEFAULT_FILENAME,
        contentType: file.type || DEFAULT_CONTENT_TYPE,
        body: await file.arrayBuffer()
      },
      user
    );
    return Response.json(attachment, { status: 201 });
  }),
  // GET /api/attachments/{id} — stream an attachment blob (inline preview for safe raster images).
  //   expects : path {id} (attachment id)
  //   returns : 200 · the R2 blob streamed with its stored content-type. Safe raster images
  //             (isInlineSafe) get Content-Disposition: inline so the browser previews them;
  //             everything else (incl. HTML/SVG, and any MIME/extension mismatch) is forced to
  //             download so it can never execute as stored XSS in the worker origin   ·   404 when missing
  authed("/api/attachments/{id}").get(async ctx => {
    const file = await ctx.require(attachmentsPlugin).getForDownload(ctx.env, ctx.params.id);
    if (!file) return notFound();

    const disposition = isInlineSafe(file.contentType, file.filename) ? "inline" : "attachment";
    const safeName = file.filename.replaceAll(/["\r\n]/g, "");

    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `${disposition}; filename="${safeName}"`
      }
    });
  }),
  // DELETE /api/attachments/{id} — delete an attachment (R2 blob + D1 row; broadcasts attachment.removed).
  //   expects : path {id} (attachment id)
  //   returns : 204 · empty   ·   401 when no user   (removing an absent attachment is a no-op)
  authed("/api/attachments/{id}").delete(async ctx => {
    const { user } = ctx;
    await ctx.require(attachmentsPlugin).remove(ctx.env, ctx.params.id, user);
    return noContent();
  }),

  // ── Customize (universal colour/icon) ───────────────────────────────────
  // POST /api/customize — upsert a colour/icon customization for an element.
  //   expects : JSON body CustomizationInput { elementType, elementId, boardId, color?, icon? }
  //   returns : 200 · Customization   ·   401 when no user
  //   (A null color/icon clears that field — this is also the "remove" path; one upsert serves both.)
  authed("/api/customize").post(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as CustomizationInput;
    const customization = await ctx.require(customizePlugin).set(ctx.env, input, user);
    return Response.json(customization);
  }),

  // ── Users (signed-in profiles → assignable demo users, #6) ──────────────
  // GET /api/users — every persisted user (the selectable accounts the choosers merge with the cast).
  //   expects : —
  //   returns : 200 · User[]
  authed("/api/users").get(async ctx =>
    Response.json(await ctx.require(usersPlugin).list(ctx.env))
  ),
  // GET /api/users/me — the current user's profile (creates a default row on first read).
  //   expects : the session cookie (resolved to an Actor)
  //   returns : 200 · User   ·   401 when no user
  // NOTE: declared BEFORE any future /api/users/{id} so the literal `/me` wins the specificity match.
  authed("/api/users/me").get(async ctx => {
    const { user } = ctx;
    return Response.json(await ctx.require(usersPlugin).getMe(ctx.env, user));
  }),
  // PUT /api/users/me — upsert the current user's display name + avatar colour token.
  //   expects : JSON body ProfileInput { name, color }
  //   returns : 200 · User   ·   401 when no user   ·   400 on a blank name
  authed("/api/users/me").put(async ctx => {
    const { user } = ctx;
    const input = (await ctx.request.json()) as ProfileInput;
    const name = input.name.trim();
    if (!name) return badRequest("name required");
    return Response.json(
      await ctx.require(usersPlugin).updateProfile(ctx.env, user, { name, color: input.color })
    );
  }),

  // ── Activity (the durable Record) ───────────────────────────────────────
  // GET /api/activity — recent activity, newest-first, optionally scoped to a board.
  //   expects : query ?boardId=<id>? · ?limit=<n>?   (both optional; limit defaults to 50)
  //   returns : 200 · Activity[]
  authed("/api/activity").get(async ctx => {
    const boardId = ctx.url.searchParams.get("boardId") ?? undefined;
    const limitText = ctx.url.searchParams.get("limit") ?? undefined;
    const limit = limitText === undefined ? undefined : Number.parseInt(limitText, 10);
    const opts: { boardId?: string; limit?: number } = {};
    if (boardId !== undefined) opts.boardId = boardId;
    if (limit !== undefined && Number.isFinite(limit)) opts.limit = limit;
    return Response.json(await ctx.require(activityPlugin).list(ctx.env, opts));
  }),

  // ── Live (WebSocket) ────────────────────────────────────────────────────
  // GET /ws/board/{id} — open the live channel for a board.
  //   expects : path {id} · a WebSocket upgrade request (Upgrade: websocket)
  //   returns : 101 Switching Protocols — the upgrade is forwarded to the per-board Durable Object,
  //             which owns connection hibernation + patch fan-out to every connected client
  authed("/ws/board/{id}").get(ctx =>
    ctx.require(durableObjectsPlugin).get(ctx.env, "board", ctx.params.id).fetch(ctx.request)
  )
];
