/**
 * @file REST client for the Atlas worker API (browser-safe; every island imports this module).
 *
 * One thin typed function per endpoint in {@link file://../endpoints.ts}, grouped by resource (auth ·
 * departments · boards · columns · issues · sub-issues · attachments · customize · activity). Every
 * call hits the same-origin worker (`/api/*`) with `credentials: "same-origin"` so the HttpOnly
 * session cookie rides along. Mutations return the persisted entity; the matching realtime
 * {@link BoardPatch} arrives separately over the WebSocket (see {@link file://./realtime.ts}) — that
 * patch, not the return value, is what drives the live board. Each call throws on a non-2xx response
 * (sign-out and the session probe degrade gracefully instead) so callers can surface failures.
 */
import { hardNavigate } from "./hard-nav";
import type {
  Activity,
  Attachment,
  Board,
  BoardSnapshot,
  BoardSummary,
  Column,
  Credentials,
  Customization,
  CustomizationInput,
  Department,
  DepartmentsIndex,
  Issue,
  IssueDetail,
  IssueMove,
  IssuePatch,
  NewBoard,
  NewColumn,
  NewDepartment,
  NewIssue,
  NewSubIssue,
  Session,
  SubIssue
} from "./types";

/** Actor identity returned by the session probe. */
export type SessionActor = { id: string; name: string };

/** MIME type for JSON request bodies. */
const JSON_TYPE = "application/json";

// ─── core fetch ──────────────────────────────────────────────────────────────

/**
 * The client-side auth gate. App routes are static HTML served to everyone, but their data lives
 * behind the worker's guard — so a guarded call answering `401` means the session is gone (never
 * signed in, expired, or signed out then navigated back). Send the visitor to the sign-in screen.
 * No-op on the auth pages themselves (so a 401 probe there can't loop).
 *
 * @param status - The response status to inspect.
 * @returns `true` when the status was `401` and a redirect was triggered.
 * @example
 * ```ts
 * if (redirectedOnUnauthorized(response.status)) throw new Error("unauthorized");
 * ```
 */
function redirectedOnUnauthorized(status: number): boolean {
  if (status !== 401) return false;
  const path = globalThis.location?.pathname ?? "";
  if (path !== "/signin" && path !== "/signup") {
    // A full-page load (not an intercepted SPA swap) so the auth split actually renders — see
    // hard-nav.ts. The server-side gate (cloudflare/worker.ts) catches the common logged-out
    // landing; this is the mid-session-expiry fallback.
    hardNavigate("/signin/");
  }
  return true;
}

/**
 * Fetch a path on the worker API and parse its JSON response, throwing on a non-2xx status. Always
 * sends same-origin credentials so the session cookie is included; a `401` redirects to sign-in.
 *
 * @param path - The API path (same-origin), e.g. `/api/departments`.
 * @param init - Optional fetch init (method, headers, body).
 * @returns The parsed JSON response body, typed as `T`.
 * @example
 * ```ts
 * const index = await request<DepartmentsIndex>("/api/departments");
 * ```
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) {
    redirectedOnUnauthorized(response.status);
    throw new Error(`Atlas API ${init?.method ?? "GET"} ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * Fire a request that returns no body (a 204 delete/reorder/toggle), throwing on a non-2xx status; a
 * `401` redirects to sign-in.
 *
 * @param path - The API path (same-origin).
 * @param init - The fetch init (method etc.).
 * @returns Resolves once the worker confirms the mutation.
 * @example
 * ```ts
 * await send(`/api/boards/${boardId}`, { method: "DELETE" });
 * ```
 */
async function send(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) {
    redirectedOnUnauthorized(response.status);
    throw new Error(`Atlas API ${init.method ?? "GET"} ${path} failed (${response.status})`);
  }
}

/**
 * Build a fetch init for a JSON-body request (POST/PATCH).
 *
 * @param method - The HTTP method.
 * @param body - The value serialised as the JSON request body.
 * @returns A fetch init with the JSON content-type header and serialised body.
 * @example
 * ```ts
 * await request<Board>("/api/boards", jsonInit("POST", { departmentId, title }));
 * ```
 */
function jsonInit<T extends object>(method: string, body: T): RequestInit {
  return { method, headers: { "content-type": JSON_TYPE }, body: JSON.stringify(body) };
}

// ─── auth ──────────────────────────────────────────────────────────────────

/**
 * Sign in (demo auth — any valid-looking credentials work). The worker mints a session and sets the
 * HttpOnly cookie via `Set-Cookie`, so later same-origin calls are authenticated automatically.
 *
 * @param creds - The credentials `{ email, password }`.
 * @returns The resolved session.
 * @example
 * ```ts
 * await signIn({ email: "anya@atlas.dev", password: "secret" });
 * ```
 */
export async function signIn(creds: Credentials): Promise<Session> {
  return request<Session>("/api/auth/signin", jsonInit("POST", creds));
}

/**
 * Open an account (demo auth) — like {@link signIn}, also recording the display name.
 *
 * @param creds - The credentials `{ email, password, name? }`.
 * @returns The resolved session.
 * @example
 * ```ts
 * await signUp({ email: "ada@atlas.dev", password: "secret", name: "Ada Lovelace" });
 * ```
 */
export async function signUp(creds: Credentials): Promise<Session> {
  return request<Session>("/api/auth/signup", jsonInit("POST", creds));
}

/**
 * Sign out — invalidate the session and clear the cookie. Idempotent; never throws.
 *
 * @returns Resolves once the worker has cleared the session.
 * @example
 * ```ts
 * await signOut();
 * ```
 */
export async function signOut(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" }).catch(() => {});
}

/**
 * Probe the current session, resolving the signed-in actor or `undefined` when unauthenticated.
 *
 * @returns The actor `{ id, name }`, or `undefined` on a 401 / network error.
 * @example
 * ```ts
 * const actor = await getSession();
 * if (!actor) location.assign("/signin");
 * ```
 */
export async function getSession(): Promise<SessionActor | undefined> {
  try {
    const response = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!response.ok) return undefined;
    return (await response.json()) as SessionActor;
  } catch {
    return undefined;
  }
}

// ─── departments ─────────────────────────────────────────────────────────────

/**
 * Load the departments index (departments + their customizations).
 *
 * @returns The departments index.
 * @example
 * ```ts
 * const { departments, customizations } = await listDepartments();
 * ```
 */
export async function listDepartments(): Promise<DepartmentsIndex> {
  return request<DepartmentsIndex>("/api/departments");
}

/**
 * Create a department at the next free position.
 *
 * @param input - The new-department input `{ title }`.
 * @returns The created department.
 * @example
 * ```ts
 * const dept = await createDepartment({ title: "Research" });
 * ```
 */
export async function createDepartment(input: NewDepartment): Promise<Department> {
  return request<Department>("/api/departments", jsonInit("POST", input));
}

/**
 * Move a department to a new index (re-packs siblings).
 *
 * @param id - The department to move.
 * @param position - The target 0-based position.
 * @returns Resolves once the move persists.
 * @example
 * ```ts
 * await reorderDepartment(deptId, 0);
 * ```
 */
export async function reorderDepartment(id: string, position: number): Promise<void> {
  await send("/api/departments/reorder", jsonInit("POST", { id, position }));
}

/**
 * Rename a department.
 *
 * @param id - The department to rename.
 * @param title - The new title.
 * @returns The updated department.
 * @example
 * ```ts
 * const dept = await renameDepartment(deptId, "Platform Eng");
 * ```
 */
export async function renameDepartment(id: string, title: string): Promise<Department> {
  return request<Department>(`/api/departments/${id}`, jsonInit("PATCH", { title }));
}

/**
 * Delete a department and its cascade subtree.
 *
 * @param id - The department to delete.
 * @returns Resolves once the delete persists.
 * @example
 * ```ts
 * await deleteDepartment(deptId);
 * ```
 */
export async function deleteDepartment(id: string): Promise<void> {
  await send(`/api/departments/${id}`, { method: "DELETE" });
}

/**
 * List a department's board summaries (KV-indexed on the server, D1 fallback).
 *
 * @param departmentId - The department whose boards to list.
 * @returns The board summaries, in position order.
 * @example
 * ```ts
 * const boards = await listBoards(deptId);
 * ```
 */
export async function listBoards(departmentId: string): Promise<BoardSummary[]> {
  return request<BoardSummary[]>(`/api/departments/${departmentId}/boards`);
}

// ─── boards ──────────────────────────────────────────────────────────────────

/**
 * Create a board (the server seeds its four default columns).
 *
 * @param input - The new-board input `{ departmentId, title, standfirst?, eyebrow? }`.
 * @returns The created board.
 * @example
 * ```ts
 * const board = await createBoard({ departmentId: deptId, title: "Mobile App" });
 * ```
 */
export async function createBoard(input: NewBoard): Promise<Board> {
  return request<Board>("/api/boards", jsonInit("POST", input));
}

/**
 * Move a board within its department (re-packs siblings).
 *
 * @param id - The board to move.
 * @param position - The target 0-based position.
 * @returns Resolves once the move persists.
 * @example
 * ```ts
 * await reorderBoard(boardId, 1);
 * ```
 */
export async function reorderBoard(id: string, position: number): Promise<void> {
  await send("/api/boards/reorder", jsonInit("POST", { id, position }));
}

/**
 * Load a full board snapshot — the realtime seed (board + columns + issues + sub-issues + labels +
 * assignees + attachments + customizations).
 *
 * @param boardId - The board id to load.
 * @returns The board snapshot.
 * @example
 * ```ts
 * const snapshot = await getBoard(boardId);
 * ```
 */
export async function getBoard(boardId: string): Promise<BoardSnapshot> {
  return request<BoardSnapshot>(`/api/boards/${boardId}`);
}

/**
 * Rename a board (broadcasts `board.renamed`).
 *
 * @param id - The board to rename.
 * @param title - The new title.
 * @returns The updated board.
 * @example
 * ```ts
 * const board = await renameBoard(boardId, "Platform");
 * ```
 */
export async function renameBoard(id: string, title: string): Promise<Board> {
  return request<Board>(`/api/boards/${id}`, jsonInit("PATCH", { title }));
}

/**
 * Delete a board and its cascade subtree (broadcasts `board.deleted`).
 *
 * @param id - The board to delete.
 * @returns Resolves once the delete persists.
 * @example
 * ```ts
 * await deleteBoard(boardId);
 * ```
 */
export async function deleteBoard(id: string): Promise<void> {
  await send(`/api/boards/${id}`, { method: "DELETE" });
}

// ─── columns ───────────────────────────────────────────────────────────────

/**
 * Append a column to a board (broadcasts `column.created`).
 *
 * @param boardId - The board to add the column to.
 * @param input - The new-column input `{ title }`.
 * @returns The created column.
 * @example
 * ```ts
 * const column = await createColumn(boardId, { title: "QA" });
 * ```
 */
export async function createColumn(boardId: string, input: NewColumn): Promise<Column> {
  return request<Column>(`/api/boards/${boardId}/columns`, jsonInit("POST", input));
}

/**
 * Move a column within a board (broadcasts `column.reordered`).
 *
 * @param boardId - The board owning the column.
 * @param columnId - The column to move.
 * @param position - The target 0-based position.
 * @returns Resolves once the move persists.
 * @example
 * ```ts
 * await reorderColumn(boardId, columnId, 2);
 * ```
 */
export async function reorderColumn(
  boardId: string,
  columnId: string,
  position: number
): Promise<void> {
  await send(`/api/boards/${boardId}/columns/reorder`, jsonInit("POST", { columnId, position }));
}

/**
 * Rename a column (broadcasts `column.renamed`).
 *
 * @param boardId - The board owning the column.
 * @param columnId - The column to rename.
 * @param title - The new title.
 * @returns The updated column.
 * @example
 * ```ts
 * const column = await renameColumn(boardId, columnId, "In QA");
 * ```
 */
export async function renameColumn(
  boardId: string,
  columnId: string,
  title: string
): Promise<Column> {
  return request<Column>(
    `/api/boards/${boardId}/columns/${columnId}`,
    jsonInit("PATCH", { title })
  );
}

/**
 * Delete a column and its cascade subtree (broadcasts `column.deleted`).
 *
 * @param boardId - The board owning the column.
 * @param columnId - The column to delete.
 * @returns Resolves once the delete persists.
 * @example
 * ```ts
 * await deleteColumn(boardId, columnId);
 * ```
 */
export async function deleteColumn(boardId: string, columnId: string): Promise<void> {
  await send(`/api/boards/${boardId}/columns/${columnId}`, { method: "DELETE" });
}

// ─── issues ────────────────────────────────────────────────────────────────

/**
 * Create an issue in a column (broadcasts `issue.created`).
 *
 * @param boardId - The board containing the column.
 * @param columnId - The column to add the issue to.
 * @param input - The new-issue input `{ title, description? }`.
 * @returns The created issue.
 * @example
 * ```ts
 * const issue = await createIssue(boardId, columnId, { title: "Fix flaky reconnect" });
 * ```
 */
export async function createIssue(
  boardId: string,
  columnId: string,
  input: NewIssue
): Promise<Issue> {
  return request<Issue>(
    `/api/boards/${boardId}/columns/${columnId}/issues`,
    jsonInit("POST", input)
  );
}

/**
 * Load full issue detail (issue + sub-issues + labels + assignees + attachments).
 *
 * @param issueId - The issue id to load.
 * @returns The issue detail.
 * @example
 * ```ts
 * const detail = await getIssue(issueId);
 * ```
 */
export async function getIssue(issueId: string): Promise<IssueDetail> {
  return request<IssueDetail>(`/api/issues/${issueId}`);
}

/**
 * Patch an issue's properties (title/description/status/priority/labels/assignees/…).
 *
 * @param issueId - The issue to patch.
 * @param patch - The fields to change.
 * @returns The updated issue.
 * @example
 * ```ts
 * const issue = await patchIssue(issueId, { priority: "high", labels: ["bug"] });
 * ```
 */
export async function patchIssue(issueId: string, patch: IssuePatch): Promise<Issue> {
  return request<Issue>(`/api/issues/${issueId}`, jsonInit("PATCH", patch));
}

/**
 * Delete an issue (broadcasts `issue.deleted`).
 *
 * @param issueId - The issue to delete.
 * @returns Resolves once the delete persists.
 * @example
 * ```ts
 * await deleteIssue(issueId);
 * ```
 */
export async function deleteIssue(issueId: string): Promise<void> {
  await send(`/api/issues/${issueId}`, { method: "DELETE" });
}

/**
 * Move an issue to a target column, position, and status (broadcasts `issue.moved`).
 *
 * @param issueId - The issue to move.
 * @param move - The target `{ toColumnId, position, status }`.
 * @returns The updated issue.
 * @example
 * ```ts
 * const issue = await moveIssue(issueId, { toColumnId, position: 0, status: "in_progress" });
 * ```
 */
export async function moveIssue(issueId: string, move: IssueMove): Promise<Issue> {
  return request<Issue>(`/api/issues/${issueId}/move`, jsonInit("POST", move));
}

// ─── sub-issues ──────────────────────────────────────────────────────────────

/**
 * Add a checklist sub-issue to an issue (broadcasts `subIssue.added`).
 *
 * @param issueId - The parent issue.
 * @param input - The new-sub-issue input `{ title }`.
 * @returns The created sub-issue.
 * @example
 * ```ts
 * const sub = await addSubIssue(issueId, { title: "Write the migration" });
 * ```
 */
export async function addSubIssue(issueId: string, input: NewSubIssue): Promise<SubIssue> {
  return request<SubIssue>(`/api/issues/${issueId}/sub-issues`, jsonInit("POST", input));
}

/**
 * Toggle a sub-issue's done state (broadcasts `subIssue.toggled`).
 *
 * @param issueId - The parent issue.
 * @param subIssueId - The sub-issue to toggle.
 * @param done - The new done state.
 * @returns Resolves once the toggle persists.
 * @example
 * ```ts
 * await toggleSubIssue(issueId, subId, true);
 * ```
 */
export async function toggleSubIssue(
  issueId: string,
  subIssueId: string,
  done: boolean
): Promise<void> {
  await send(`/api/issues/${issueId}/sub-issues/${subIssueId}`, jsonInit("PATCH", { done }));
}

/**
 * Remove a sub-issue (broadcasts `subIssue.removed`).
 *
 * @param issueId - The parent issue.
 * @param subIssueId - The sub-issue to remove.
 * @returns Resolves once the removal persists.
 * @example
 * ```ts
 * await removeSubIssue(issueId, subId);
 * ```
 */
export async function removeSubIssue(issueId: string, subIssueId: string): Promise<void> {
  await send(`/api/issues/${issueId}/sub-issues/${subIssueId}`, { method: "DELETE" });
}

// ─── attachments ─────────────────────────────────────────────────────────────

/**
 * Build the same-origin URL the worker streams an attachment blob from — used as an `<img>` src for
 * inline previews and as the download/open-in-new-tab link target.
 *
 * @param attachmentId - The attachment id.
 * @returns The `/api/attachments/{id}` blob URL.
 * @example
 * ```ts
 * <img src={attachmentUrl(attachment.id)} alt={attachment.filename} />
 * ```
 */
export function attachmentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`;
}

/**
 * Upload an attachment to an issue (multipart `file` part; broadcasts `attachment.added`).
 *
 * @param issueId - The issue to attach to.
 * @param file - The selected/dropped file.
 * @returns The stored attachment metadata.
 * @example
 * ```ts
 * const attachment = await addAttachment(issueId, fileInput.files[0]);
 * ```
 */
export async function addAttachment(issueId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.set("file", file);
  return request<Attachment>(`/api/issues/${issueId}/attachments`, { method: "POST", body: form });
}

/**
 * Delete an attachment — R2 blob + D1 row (broadcasts `attachment.removed`).
 *
 * @param attachmentId - The attachment to delete.
 * @returns Resolves once the delete persists.
 * @example
 * ```ts
 * await deleteAttachment(attachmentId);
 * ```
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  await send(`/api/attachments/${attachmentId}`, { method: "DELETE" });
}

// ─── customize ─────────────────────────────────────────────────────────────

/**
 * Upsert a colour/icon customization for a hierarchy element (broadcasts `customized` for board-scoped
 * elements). A `null` colour or icon clears that field — the same call serves "remove".
 *
 * @param input - The customization input `{ elementType, elementId, boardId, color?, icon? }`.
 * @returns The persisted customization.
 * @example
 * ```ts
 * await setCustomization({ elementType: "board", elementId, boardId, color: "--accent", icon: "rocket" });
 * ```
 */
export async function setCustomization(input: CustomizationInput): Promise<Customization> {
  return request<Customization>("/api/customize", jsonInit("POST", input));
}

// ─── activity ──────────────────────────────────────────────────────────────

/**
 * List recent activity, newest-first, optionally scoped to a board (the Record drawer seed).
 *
 * @param opts - Optional scope `{ boardId?, limit? }` (limit defaults server-side to 50).
 * @param opts.boardId - Restrict the feed to one board.
 * @param opts.limit - Cap the number of entries returned.
 * @returns The recent activity entries.
 * @example
 * ```ts
 * const feed = await listActivity({ boardId, limit: 100 });
 * ```
 */
export async function listActivity(
  opts: { boardId?: string; limit?: number } = {}
): Promise<Activity[]> {
  const params = new URLSearchParams();
  if (opts.boardId) params.set("boardId", opts.boardId);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return request<Activity[]>(`/api/activity${suffix}`);
}
