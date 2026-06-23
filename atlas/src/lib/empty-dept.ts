/**
 * @file Empty-department store — the shared module that lets the chrome islands agree on "an empty
 * department is selected" when the URL can't say so. Departments are not their own route (see
 * {@link file://./nav.ts}), so the active department is normally derived from the URL's board id. A
 * department with NO boards has no board to navigate to, so clicking its tab leaves the URL untouched —
 * and there is nothing in the URL to represent "empty department X is selected."
 *
 * This tiny pub/sub fills that gap: clicking an empty department tab calls {@link setEmptyDept}, and the
 * `departments`, `boards-bar`, `board`, and `board-header` islands subscribe via {@link onEmptyDept} to
 * paint the empty-department view (the dept underlined active, an "Add board"-only boards bar, and the
 * editorial empty-state) without a navigation. It is cleared ({@link setEmptyDept} `undefined`) on the
 * next real navigation, when the URL once again owns the active context.
 */

/** A department selected for the empty-department view (it has no boards to navigate to). */
export interface EmptyDept {
  /** The selected department's id (the parent of its "Add board"). */
  id: string;
  /** The selected department's title (for any place that labels the empty view). */
  title: string;
}

/** The selected empty department, or undefined when a real board/route owns the active context. */
let current: EmptyDept | undefined;
/** Subscribers notified whenever the selected empty department changes. */
const listeners = new Set<(dept: EmptyDept | undefined) => void>();

/**
 * The currently-selected empty department, or undefined when none is selected.
 *
 * @returns The selected empty department, or undefined.
 * @example
 * ```ts
 * const empty = getEmptyDept();
 * if (empty) renderEmptyState();
 * ```
 */
export function getEmptyDept(): EmptyDept | undefined {
  return current;
}

/**
 * Select an empty department (or clear the selection with `undefined`) and notify subscribers. A no-op
 * when the selection is unchanged (same id, or both cleared) so a real navigation that clears an
 * already-clear store fires no redundant re-syncs.
 *
 * @param next - The department to select, or `undefined` to clear (a real navigation took over).
 * @example
 * ```ts
 * setEmptyDept({ id: department.id, title: department.title }); // clicked an empty dept tab
 * setEmptyDept(undefined); // a real board navigation took over
 * ```
 */
export function setEmptyDept(next: EmptyDept | undefined): void {
  if (next?.id === current?.id) return;
  current = next;
  for (const listener of listeners) listener(current);
}

/**
 * Subscribe to empty-department changes, returning an unsubscribe function.
 *
 * @param listener - Called with the selected empty department (or undefined when cleared).
 * @returns A function that removes the listener.
 * @example
 * ```ts
 * const off = onEmptyDept(() => void sync(ctx));
 * off();
 * ```
 */
export function onEmptyDept(listener: (dept: EmptyDept | undefined) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
