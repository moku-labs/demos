/**
 * @file Navigation store — the shared module the chrome islands (`departments`, `boards-bar`,
 * `board-header`) read to answer "which department / board / view is active, and what are the
 * siblings?". It owns a small cache over {@link file://./api.ts} (the departments index + each
 * department's board summaries) so those three islands resolve the same context without each
 * re-fetching, and derives the active board + view straight from the URL — the single source of truth
 * for navigation (web Rule R2: every place is a deep link).
 *
 * After a department/board mutation, call {@link refresh} to drop the caches and notify every reader
 * so the chrome re-renders against fresh data.
 */
import { listBoards, listDepartments } from "./api";
import type { BoardSummary, Customization, Department } from "./types";

/** The active navigation context resolved from the URL + the cached index. */
export interface NavContext {
  /** All departments, in position order. */
  departments: Department[];
  /** Department-level customizations (from the index). */
  customizations: Customization[];
  /** The active department id, or undefined when there are no departments. */
  activeDepartmentId: string | undefined;
  /** The active board id, or undefined when the active department has no boards. */
  activeBoardId: string | undefined;
  /** The active department's boards, in position order. */
  boards: BoardSummary[];
  /** Which view the URL selects. */
  view: "board" | "list";
}

/** Matches `/board/{id}` and its `/list` · `/issue/{issueId}` · `/activity` sub-routes. */
const BOARD_PATH = /^\/board\/([^/]+)(?:\/(list|issue|activity)(?:\/([^/]+))?)?\/?$/;

/**
 * Navigate the SPA to an internal path. The `spa` plugin intercepts internal anchor clicks (History +
 * Navigation API), but a bare `history.pushState` does not trigger a swap — so programmatic navigation
 * synthesises a real anchor click, the one path both interceptors honour. Build `path` from
 * {@link file://../routes.tsx} `urls`, never a literal.
 *
 * @param path - The internal path to navigate to (e.g. `urls.toUrl("board", { id })`).
 * @example
 * ```ts
 * navigate(urls.toUrl("issue", { id: boardId, issueId }));
 * ```
 */
export function navigate(path: string): void {
  const anchor = document.createElement("a");
  anchor.href = path;
  // appendChild (not append): @cloudflare/workers-types merges Element.append into a conflicting
  // overload set in this project, so the DOM helper is used explicitly.
  // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Cached departments index (departments + customizations), or undefined until first load. */
let indexCache: { departments: Department[]; customizations: Customization[] } | undefined;
/** In-flight index load shared by concurrent callers (single-flight), or undefined when idle. */
let indexInFlight:
  | Promise<{ departments: Department[]; customizations: Customization[] }>
  | undefined;
/** Cached board summaries per department id. */
const boardsCache = new Map<string, BoardSummary[]>();
/** In-flight board-summary loads per department id (single-flight), cleared once each settles. */
const boardsInFlight = new Map<string, Promise<BoardSummary[]>>();
/** Subscribers notified on {@link refresh}. */
const listeners = new Set<() => void>();

/**
 * The board id in the current URL, or undefined on a non-board route (the auth pages / a bare `/`).
 *
 * @returns The board id, or undefined.
 * @example
 * ```ts
 * const id = boardIdFromUrl(); // "/board/abc/list" -> "abc"
 * ```
 */
export function boardIdFromUrl(): string | undefined {
  return BOARD_PATH.exec(globalThis.location.pathname)?.[1];
}

/**
 * The view the current URL selects — `list` for `/board/{id}/list`, otherwise `board`.
 *
 * @returns The active view.
 * @example
 * ```ts
 * const view = currentView();
 * ```
 */
export function currentView(): "board" | "list" {
  return BOARD_PATH.exec(globalThis.location.pathname)?.[2] === "list" ? "list" : "board";
}

/**
 * Load the departments index, caching it after the first call.
 *
 * @returns The departments + their customizations.
 * @example
 * ```ts
 * const { departments } = await loadIndex();
 * ```
 */
export async function loadIndex(): Promise<{
  departments: Department[];
  customizations: Customization[];
}> {
  if (indexCache) return indexCache;
  // Single-flight: the three chrome islands all resolve nav context on mount at once; share one
  // request instead of each firing its own `/api/departments` (drop the in-flight ref once settled).
  indexInFlight ??= listDepartments()
    .then(index => {
      indexCache = {
        departments: index.departments.toSorted((a, b) => a.position - b.position),
        customizations: index.customizations
      };
      return indexCache;
    })
    .finally(() => {
      indexInFlight = undefined;
    });
  return indexInFlight;
}

/**
 * Load a department's board summaries, caching them per department.
 *
 * @param departmentId - The department whose boards to load.
 * @returns The board summaries.
 * @example
 * ```ts
 * const boards = await loadBoards(deptId);
 * ```
 */
export async function loadBoards(departmentId: string): Promise<BoardSummary[]> {
  const cached = boardsCache.get(departmentId);
  if (cached) return cached;
  // Single-flight per department: `resolveActive` loads every department's boards in parallel and
  // several islands call it together — share one request per id (cleared once it settles).
  const existing = boardsInFlight.get(departmentId);
  if (existing) return existing;
  const inFlight = listBoards(departmentId)
    .then(boards => {
      boardsCache.set(departmentId, boards);
      return boards;
    })
    .finally(() => {
      boardsInFlight.delete(departmentId);
    });
  boardsInFlight.set(departmentId, inFlight);
  return inFlight;
}

/**
 * Resolve the full active navigation context from the URL + cached index. On a board route, finds the
 * department owning the URL's board; on a bare `/`, defaults to the first department's first board.
 *
 * @returns The resolved {@link NavContext}.
 * @example
 * ```ts
 * const { departments, activeDepartmentId, activeBoardId, view } = await resolveActive();
 * ```
 */
export async function resolveActive(): Promise<NavContext> {
  const { departments, customizations } = await loadIndex();
  const view = currentView();
  const urlBoardId = boardIdFromUrl();

  // Board route: find which department owns the URL's board (board lists load in parallel, cached).
  if (urlBoardId) {
    const lists = await Promise.all(departments.map(d => loadBoards(d.id)));
    const ownerIndex = lists.findIndex(boards => boards.some(b => b.id === urlBoardId));
    const missing = ownerIndex === -1;
    const owner = departments[missing ? 0 : ownerIndex];
    return {
      departments,
      customizations,
      activeDepartmentId: owner?.id,
      activeBoardId: urlBoardId,
      boards: missing ? [] : (lists[ownerIndex] ?? []),
      view
    };
  }

  // Bare "/" — default to the first department's first board.
  const firstDept = departments[0];
  const boards = firstDept ? await loadBoards(firstDept.id) : [];
  return {
    departments,
    customizations,
    activeDepartmentId: firstDept?.id,
    activeBoardId: boards[0]?.id,
    boards,
    view
  };
}

/**
 * Subscribe to navigation refreshes (fired by {@link refresh} after a mutation), returning an
 * unsubscribe function.
 *
 * @param listener - Called when the caches are dropped.
 * @returns A function that removes the listener.
 * @example
 * ```ts
 * const off = onNavRefresh(() => rerender());
 * off();
 * ```
 */
export function onNavRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Drop the cached index + board lists and notify subscribers — call after creating, renaming,
 * reordering, or deleting a department or board so the chrome re-resolves against fresh data.
 *
 * @example
 * ```ts
 * await createBoard({ departmentId, title });
 * refresh();
 * ```
 */
export function refresh(): void {
  indexCache = undefined;
  indexInFlight = undefined;
  boardsCache.clear();
  boardsInFlight.clear();
  for (const listener of listeners) listener();
}
