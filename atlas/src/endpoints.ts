/**
 * @file Atlas HTTP + WebSocket endpoint table — the worker's whole routing surface, in one place.
 *
 * Each entry is a declarative `endpoint(path).method(handler)` from `@moku-labs/worker`, grouped by
 * resource (health · auth · departments · boards · columns · issues · sub-issues · attachments ·
 * customize · activity · live). Handlers are deliberately thin: read `ctx.params` / `ctx.request` /
 * `ctx.env`, resolve the acting `Actor` for mutations via `auth.resolveActor`, delegate to a plugin
 * via `ctx.require`, and return a `Response`. Every D1 / KV / Queues / R2 / Durable-Object side
 * effect — and every `realtime.broadcast` / `ctx.emit` — lives inside those plugins, never here.
 *
 * **Cross-plugin view-models are assembled HERE, not in a plugin** (spec/12 §"Consumer API surface"):
 * `GET /api/departments` merges `departments.list` + `customize.getCustomizationsForDepartments`
 * into a `DepartmentsIndex`; `GET /api/boards/{id}` merges `boards.getBoardWithColumns` +
 * `issues.listForBoard` + `attachments.listForBoard` + `customize.getCustomizationsForBoard` into one
 * `BoardSnapshot` (the realtime seed). This is why `boards`/`departments` do not depend on `customize`.
 *
 * `src/server.ts` consumes this array as `server: { endpoints }` and `server.server.handle` dispatches
 * it (most-specific path wins). The Cloudflare adapter (`cloudflare/worker.ts`) runs the auth
 * prefix-guard (`auth.isAuthed`) BEFORE dispatch on every `/api/*` + `/ws/*` request except the public
 * `/api/auth/*` routes — so these handlers never re-check the session, only resolve the actor for
 * attribution. Each comment states three things:
 *   • expects — path params / request body / headers the handler reads
 *   • does    — the one-line action (the header line after the method + path)
 *   • returns — status code + JSON/stream shape on success (and notable error statuses)
 */

import type { Server } from "@moku-labs/worker";
import { durableObjectsPlugin, endpoint } from "@moku-labs/worker";
import { isInlineSafe } from "./lib/attachments";
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
  NewSubIssue
} from "./lib/types";
import { activityPlugin } from "./plugins/activity";
import { attachmentsPlugin } from "./plugins/attachments";
import { authPlugin } from "./plugins/auth";
import { boardsPlugin } from "./plugins/boards";
import { customizePlugin } from "./plugins/customize";
import { departmentsPlugin } from "./plugins/departments";
import { issuesPlugin } from "./plugins/issues";

/** Fallback attachment filename when a multipart upload omits the file's name. */
const DEFAULT_FILENAME = "upload.bin";
/** Fallback attachment content type when a multipart upload omits a type. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Build a `401 Unauthorized` text response — returned when a mutation has no resolvable actor.
 *
 * @returns A 401 `Response` with a plain-text body.
 * @example
 * ```ts
 * if (!actor) return unauthorized();
 * ```
 */
const unauthorized = (): Response => new Response("unauthorized", { status: 401 });

/**
 * Build a `404 Not Found` text response — returned when a resource lookup misses.
 *
 * @returns A 404 `Response` with a plain-text body.
 * @example
 * ```ts
 * if (!board) return notFound();
 * ```
 */
const notFound = (): Response => new Response("not found", { status: 404 });

/**
 * Build a `400 Bad Request` text response — returned when required input is missing/malformed.
 *
 * @param message - The plain-text body explaining what was wrong (defaults to `"bad request"`).
 * @returns A 400 `Response` with the given body.
 * @example
 * ```ts
 * if (!(file instanceof File)) return badRequest("missing file part");
 * ```
 */
const badRequest = (message = "bad request"): Response => new Response(message, { status: 400 });

/**
 * Build a `204 No Content` response — returned by deletes/reorders/toggles with no body.
 *
 * Uses an `undefined` body (never `null`) so the empty-success path stays house-style clean.
 *
 * @returns A 204 `Response` with an empty body.
 * @example
 * ```ts
 * await ctx.require(boardsPlugin).delete(ctx.env, ctx.params.id, actor);
 * return noContent();
 * ```
 */
const noContent = (): Response => new Response(undefined, { status: 204 });

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

  // ── Auth (public — the worker guard treats the `/api/auth/*` prefix as unguarded) ──
  // POST /api/auth/signin — validate credential SHAPE only, mint a KV session.
  //   expects : JSON body Credentials { email, password }
  //   returns : 201 · Session { userId, name, email, token, expiresAt }   ·   400 on bad shape
  endpoint("/api/auth/signin").post(async ctx => {
    const creds = (await ctx.request.json()) as Credentials;
    try {
      return Response.json(await ctx.require(authPlugin).signIn(ctx.env, creds), { status: 201 });
    } catch {
      return badRequest("invalid credentials");
    }
  }),
  // POST /api/auth/signup — like signin, but records the supplied display name.
  //   expects : JSON body Credentials { email, password, name? }
  //   returns : 201 · Session   ·   400 on bad shape
  endpoint("/api/auth/signup").post(async ctx => {
    const creds = (await ctx.request.json()) as Credentials;
    try {
      return Response.json(await ctx.require(authPlugin).signUp(ctx.env, creds), { status: 201 });
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
    return noContent();
  }),
  // GET /api/auth/session — the current Actor for the request, or 401 when unauthenticated.
  //   expects : Authorization: Bearer <token>  OR  the session cookie
  //   returns : 200 · Actor { id, name }   ·   401 when no valid session
  endpoint("/api/auth/session").get(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    return Response.json(actor);
  }),

  // ── Departments ─────────────────────────────────────────────────────────
  // GET /api/departments — the DepartmentsIndex (departments + their customizations).
  //   expects : —
  //   returns : 200 · DepartmentsIndex   (VIEW-MODEL assembled here: list + dept customizations)
  endpoint("/api/departments").get(async ctx => {
    const [departments, customizations] = await Promise.all([
      ctx.require(departmentsPlugin).list(ctx.env),
      ctx.require(customizePlugin).getCustomizationsForDepartments(ctx.env)
    ]);
    const index: DepartmentsIndex = { departments, customizations };
    return Response.json(index);
  }),
  // POST /api/departments — create a department at the next free position.
  //   expects : JSON body NewDepartment { title }
  //   returns : 201 · Department   ·   401 when no actor
  endpoint("/api/departments").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const input = (await ctx.request.json()) as NewDepartment;
    const dept = await ctx.require(departmentsPlugin).create(ctx.env, input, actor);
    return Response.json(dept, { status: 201 });
  }),
  // POST /api/departments/reorder — move a department to a new index (re-packs siblings).
  //   expects : JSON body { id, position }
  //   returns : 204 · empty   ·   401 when no actor
  // NOTE: declared BEFORE /api/departments/{id} so the literal path wins the specificity match.
  endpoint("/api/departments/reorder").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { id, position } = (await ctx.request.json()) as { id: string; position: number };
    await ctx.require(departmentsPlugin).reorder(ctx.env, id, position, actor);
    return noContent();
  }),
  // PATCH /api/departments/{id} — rename a department.
  //   expects : path {id} · JSON body { title }
  //   returns : 200 · Department   ·   401 when no actor   ·   404 when the id is unknown
  endpoint("/api/departments/{id}").patch(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { title } = (await ctx.request.json()) as { title: string };
    try {
      return Response.json(
        await ctx.require(departmentsPlugin).rename(ctx.env, ctx.params.id, title, actor)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/departments/{id} — delete a department + its cascade subtree (R2 purge first).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no actor
  endpoint("/api/departments/{id}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    await ctx.require(departmentsPlugin).delete(ctx.env, ctx.params.id, actor);
    return noContent();
  }),

  // ── Boards ──────────────────────────────────────────────────────────────
  // POST /api/boards — create a board (seeds the 4 default columns) + re-warm the KV index.
  //   expects : JSON body NewBoard { departmentId, title, standfirst?, eyebrow? }
  //   returns : 201 · Board   ·   401 when no actor
  endpoint("/api/boards").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const input = (await ctx.request.json()) as NewBoard;
    const board = await ctx.require(boardsPlugin).create(ctx.env, input, actor);
    return Response.json(board, { status: 201 });
  }),
  // POST /api/boards/reorder — move a board within its department (re-packs siblings).
  //   expects : JSON body { id, position }
  //   returns : 204 · empty   ·   401 when no actor
  // NOTE: declared BEFORE /api/boards/{id} so the literal path wins the specificity match.
  endpoint("/api/boards/reorder").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { id, position } = (await ctx.request.json()) as { id: string; position: number };
    await ctx.require(boardsPlugin).reorder(ctx.env, id, position, actor);
    return noContent();
  }),
  // GET /api/boards/{id} — the full BoardSnapshot (the realtime seed).
  //   expects : path {id}
  //   returns : 200 · BoardSnapshot   ·   404 when the board is unknown
  //   VIEW-MODEL assembled here: board+columns ⊕ issues slice ⊕ attachments ⊕ customizations.
  endpoint("/api/boards/{id}").get(async ctx => {
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
  // PATCH /api/boards/{id} — rename a board (broadcasts board.renamed).
  //   expects : path {id} · JSON body { title }
  //   returns : 200 · Board   ·   401 when no actor   ·   404 when the id is unknown
  endpoint("/api/boards/{id}").patch(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { title } = (await ctx.request.json()) as { title: string };
    try {
      return Response.json(
        await ctx.require(boardsPlugin).rename(ctx.env, ctx.params.id, title, actor)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/boards/{id} — delete a board + its cascade subtree (R2 purge first, then broadcast).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no actor
  endpoint("/api/boards/{id}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    await ctx.require(boardsPlugin).delete(ctx.env, ctx.params.id, actor);
    return noContent();
  }),

  // ── Columns ─────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/columns — append a column to a board (broadcasts column.created).
  //   expects : path {id} · JSON body NewColumn { title }
  //   returns : 201 · Column   ·   401 when no actor
  endpoint("/api/boards/{id}/columns").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const input = (await ctx.request.json()) as NewColumn;
    const column = await ctx
      .require(boardsPlugin)
      .createColumn(ctx.env, ctx.params.id, input, actor);
    return Response.json(column, { status: 201 });
  }),
  // POST /api/boards/{id}/columns/reorder — move a column within a board (broadcasts column.reordered).
  //   expects : path {id} · JSON body { columnId, position }
  //   returns : 204 · empty   ·   401 when no actor
  // NOTE: declared BEFORE /api/boards/{id}/columns/{cid} so the literal path wins.
  endpoint("/api/boards/{id}/columns/reorder").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { columnId, position } = (await ctx.request.json()) as {
      columnId: string;
      position: number;
    };
    await ctx
      .require(boardsPlugin)
      .reorderColumn(ctx.env, ctx.params.id, columnId, position, actor);
    return noContent();
  }),
  // PATCH /api/boards/{id}/columns/{cid} — rename a column (broadcasts column.renamed).
  //   expects : path {id, cid} · JSON body { title }
  //   returns : 200 · Column   ·   401 when no actor   ·   404 when the column is unknown
  endpoint("/api/boards/{id}/columns/{cid}").patch(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const { title } = (await ctx.request.json()) as { title: string };
    try {
      return Response.json(
        await ctx
          .require(boardsPlugin)
          .renameColumn(ctx.env, ctx.params.id, ctx.params.cid, title, actor)
      );
    } catch {
      return notFound();
    }
  }),
  // DELETE /api/boards/{id}/columns/{cid} — delete a column + its cascade subtree (R2 purge first).
  //   expects : path {id, cid}
  //   returns : 204 · empty   ·   401 when no actor
  endpoint("/api/boards/{id}/columns/{cid}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    await ctx.require(boardsPlugin).deleteColumn(ctx.env, ctx.params.id, ctx.params.cid, actor);
    return noContent();
  }),

  // ── Issues ──────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/columns/{cid}/issues — create an issue in a column (broadcasts issue.created).
  //   expects : path {id, cid} · JSON body NewIssue { title, description? }
  //   returns : 201 · Issue   ·   401 when no actor
  endpoint("/api/boards/{id}/columns/{cid}/issues").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const input = (await ctx.request.json()) as NewIssue;
    const issue = await ctx
      .require(issuesPlugin)
      .create(ctx.env, ctx.params.id, ctx.params.cid, input, actor);
    return Response.json(issue, { status: 201 });
  }),
  // GET /api/issues/{id} — full IssueDetail (issue + sub-issues + labels + assignees + attachments).
  //   expects : path {id}
  //   returns : 200 · IssueDetail   ·   404 when the issue is unknown
  //   VIEW-MODEL: the plugin's getDetail returns attachments:[]; merge the real list here.
  endpoint("/api/issues/{id}").get(async ctx => {
    const detail = await ctx.require(issuesPlugin).getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const attachments = await ctx.require(attachmentsPlugin).listForIssue(ctx.env, ctx.params.id);
    const merged: IssueDetail = { ...detail, attachments };
    return Response.json(merged);
  }),
  // PATCH /api/issues/{id} — patch issue properties (the rail: status/priority/labels/assignees/…).
  //   expects : path {id} · JSON body IssuePatch (scalar fields and/or label/assignee sets)
  //   returns : 200 · Issue   ·   401 when no actor   ·   404 when the issue is unknown
  //   Resolves the owning boardId from the issue (setProperties needs it for label/assignee scope).
  endpoint("/api/issues/{id}").patch(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const patch = (await ctx.request.json()) as IssuePatch;
    const issue = await issues.setProperties(
      ctx.env,
      detail.issue.boardId,
      ctx.params.id,
      patch,
      actor
    );
    return Response.json(issue);
  }),
  // DELETE /api/issues/{id} — delete an issue (R2 purge first, then broadcast issue.deleted).
  //   expects : path {id}
  //   returns : 204 · empty   ·   401 when no actor   ·   404 when the issue is unknown
  endpoint("/api/issues/{id}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    await issues.delete(ctx.env, detail.issue.boardId, ctx.params.id, actor);
    return noContent();
  }),
  // POST /api/issues/{id}/move — move an issue to a target column + position + status (broadcasts issue.moved).
  //   expects : path {id} · JSON body IssueMove { toColumnId, position, status }
  //   returns : 200 · Issue   ·   401 when no actor   ·   404 when the issue is unknown
  endpoint("/api/issues/{id}/move").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const move = (await ctx.request.json()) as IssueMove;
    const issue = await issues.move(ctx.env, detail.issue.boardId, ctx.params.id, move, actor);
    return Response.json(issue);
  }),

  // ── Sub-issues (the issue checklist) ────────────────────────────────────
  // POST /api/issues/{id}/sub-issues — add a checklist sub-issue (broadcasts subIssue.added).
  //   expects : path {id} · JSON body NewSubIssue { title }
  //   returns : 201 · SubIssue   ·   401 when no actor   ·   404 when the parent issue is unknown
  endpoint("/api/issues/{id}/sub-issues").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    const input = (await ctx.request.json()) as NewSubIssue;
    const sub = await issues.addSubIssue(
      ctx.env,
      detail.issue.boardId,
      ctx.params.id,
      input,
      actor
    );
    return Response.json(sub, { status: 201 });
  }),
  // PATCH /api/issues/{id}/sub-issues/{sid} — toggle a sub-issue's done state (broadcasts subIssue.toggled).
  //   expects : path {id, sid} · JSON body { done }
  //   returns : 204 · empty   ·   401 when no actor   ·   404 when the parent issue is unknown
  endpoint("/api/issues/{id}/sub-issues/{sid}").patch(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
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
      actor
    );
    return noContent();
  }),
  // DELETE /api/issues/{id}/sub-issues/{sid} — remove a sub-issue (broadcasts subIssue.removed).
  //   expects : path {id, sid}
  //   returns : 204 · empty   ·   401 when no actor   ·   404 when the parent issue is unknown
  endpoint("/api/issues/{id}/sub-issues/{sid}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const issues = ctx.require(issuesPlugin);
    const detail = await issues.getDetail(ctx.env, ctx.params.id);
    if (!detail) return notFound();
    await issues.removeSubIssue(
      ctx.env,
      detail.issue.boardId,
      ctx.params.id,
      ctx.params.sid,
      actor
    );
    return noContent();
  }),

  // ── Attachments (R2 blob + D1 metadata) ─────────────────────────────────
  // POST /api/issues/{id}/attachments — upload an attachment to an issue (multipart; broadcasts attachment.added).
  //   expects : path {id} · multipart/form-data with a `file` part
  //   returns : 201 · Attachment   ·   400 when no file part   ·   401 when no actor   ·   404 when the issue is unknown
  //   The full AttachmentScope is composed here: issueId+columnId+boardId from the issue,
  //   departmentId from its board.
  endpoint("/api/issues/{id}/attachments").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();

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
      actor
    );
    return Response.json(attachment, { status: 201 });
  }),
  // GET /api/attachments/{id} — stream an attachment blob (inline preview for safe raster images).
  //   expects : path {id} (attachment id)
  //   returns : 200 · the R2 blob streamed with its stored content-type. Safe raster images
  //             (isInlineSafe) get Content-Disposition: inline so the browser previews them;
  //             everything else (incl. HTML/SVG, and any MIME/extension mismatch) is forced to
  //             download so it can never execute as stored XSS in the worker origin   ·   404 when missing
  endpoint("/api/attachments/{id}").get(async ctx => {
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
  //   returns : 204 · empty   ·   401 when no actor   (removing an absent attachment is a no-op)
  endpoint("/api/attachments/{id}").delete(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    await ctx.require(attachmentsPlugin).remove(ctx.env, ctx.params.id, actor);
    return noContent();
  }),

  // ── Customize (universal colour/icon) ───────────────────────────────────
  // POST /api/customize — upsert a colour/icon customization for an element.
  //   expects : JSON body CustomizationInput { elementType, elementId, boardId, color?, icon? }
  //   returns : 200 · Customization   ·   401 when no actor
  //   (A null color/icon clears that field — this is also the "remove" path; one upsert serves both.)
  endpoint("/api/customize").post(async ctx => {
    const actor = await ctx.require(authPlugin).resolveActor(ctx.request, ctx.env);
    if (!actor) return unauthorized();
    const input = (await ctx.request.json()) as CustomizationInput;
    const customization = await ctx.require(customizePlugin).set(ctx.env, input, actor);
    return Response.json(customization);
  }),

  // ── Activity (the durable Record) ───────────────────────────────────────
  // GET /api/activity — recent activity, newest-first, optionally scoped to a board.
  //   expects : query ?boardId=<id>? · ?limit=<n>?   (both optional; limit defaults to 50)
  //   returns : 200 · Activity[]
  endpoint("/api/activity").get(async ctx => {
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
  endpoint("/ws/board/{id}").get(ctx =>
    ctx.require(durableObjectsPlugin).get(ctx.env, "board", ctx.params.id).fetch(ctx.request)
  )
];

/** The session cookie name (mirrors `auth` config `cookieName`) for the sign-out token lookup. */
const SESSION_COOKIE = "atlas_session";

/**
 * Extract the session token from a request: prefer `Authorization: Bearer <token>`, then fall back
 * to the `atlas_session` cookie. Used by the sign-out handler to address the KV key to delete — the
 * auth `Api` exposes only token-based `signOut`, so the endpoint resolves the token itself.
 *
 * @param request - The incoming HTTP request.
 * @returns The raw token string, or `undefined` when no token is present.
 * @example
 * ```ts
 * const token = tokenFromRequest(ctx.request);
 * if (token) await auth.signOut(env, token);
 * ```
 */
function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : undefined;
  }

  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name?.trim() === SESSION_COOKIE) {
        const value = rest.join("=").trim();
        return value.length > 0 ? value : undefined;
      }
    }
  }

  return undefined;
}
