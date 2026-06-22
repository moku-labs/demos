/**
 * @file Filter store — the persisted facet selection shared between the `filter-panel` island (which
 * edits it) and the `board` island (which narrows the board/list by it). Design context §4: "Filtering
 * is everywhere and remembered" — so the selection survives reloads via `localStorage`, and a small
 * pub/sub keeps every reader in sync the instant a facet toggles.
 *
 * The {@link FilterSelection} shape is owned by {@link file://../components/FilterPanel.tsx} (the SSR
 * surface that renders it); this module persists it and answers the one question the board asks of each
 * issue — {@link matchIssue}.
 */
import type { FilterSelection } from "../components/FilterPanel";
import type { Issue, LabelKey } from "./types";

export type { FilterSelection } from "../components/FilterPanel";

/** localStorage key the active selection persists under (design context §4 "remembered"). */
const STORAGE_KEY = "atlas:filter";

/** The active selection (loaded from storage on module init). */
let current: FilterSelection = loadSelection();
/** Subscribers notified whenever the selection changes. */
const listeners = new Set<(selection: FilterSelection) => void>();

/**
 * Read the persisted selection from `localStorage`, returning an empty selection on miss/parse error.
 *
 * @returns The stored selection, or `{}`.
 * @example
 * ```ts
 * let current = loadSelection();
 * ```
 */
function loadSelection(): FilterSelection {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FilterSelection) : {};
  } catch {
    return {};
  }
}

/**
 * Persist the active selection to `localStorage` (silently ignores storage being unavailable).
 *
 * @example
 * ```ts
 * persist();
 * ```
 */
function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode / quota) — the selection still applies for this session.
  }
}

/**
 * The current filter selection.
 *
 * @returns The active selection (never mutated in place by callers).
 * @example
 * ```ts
 * const selection = getFilter();
 * ```
 */
export function getFilter(): FilterSelection {
  return current;
}

/**
 * Replace the active selection, persist it, and notify subscribers.
 *
 * @param next - The new selection.
 * @example
 * ```ts
 * setFilter({ labels: ["bug"], priorities: ["urgent"] });
 * ```
 */
export function setFilter(next: FilterSelection): void {
  current = next;
  persist();
  for (const listener of listeners) listener(current);
}

/**
 * Clear all facets (back to the empty selection).
 *
 * @example
 * ```ts
 * clearFilter();
 * ```
 */
export function clearFilter(): void {
  setFilter({});
}

/**
 * Whether any facet is active (drives the "filters active" cue + the empty-results state).
 *
 * @param selection - The selection to test (defaults to the active one).
 * @returns `true` when at least one facet is set.
 * @example
 * ```ts
 * if (isFilterActive()) showClearAll();
 * ```
 */
export function isFilterActive(selection: FilterSelection = current): boolean {
  return Boolean(
    selection.text?.trim() ||
      selection.labels?.length ||
      selection.priorities?.length ||
      selection.assignees?.length ||
      selection.statuses?.length
  );
}

/**
 * Subscribe to selection changes, returning an unsubscribe function.
 *
 * @param listener - Called with the new selection on every change.
 * @returns A function that removes the listener.
 * @example
 * ```ts
 * const off = onFilterChange(selection => rerender(selection));
 * off();
 * ```
 */
export function onFilterChange(listener: (selection: FilterSelection) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Test whether an issue passes the active selection — AND across facets, OR within each facet (design
 * context §4 "narrows by text, label, priority, assignee, and status at once"). An empty selection
 * matches everything. The issue's label keys + assignee ids are passed in (the board derives them once
 * from its snapshot, so the matcher stays a pure, allocation-light predicate).
 *
 * @param issue - The issue to test.
 * @param labelKeys - The issue's label keys.
 * @param assigneeIds - The issue's assignee person ids.
 * @param selection - The selection to match against (defaults to the active one).
 * @returns `true` when the issue passes every active facet.
 * @example
 * ```ts
 * const visible = issues.filter(i => matchIssue(i, labelsOf(i.id), assigneesOf(i.id)));
 * ```
 */
export function matchIssue(
  issue: Issue,
  labelKeys: readonly LabelKey[],
  assigneeIds: readonly string[],
  selection: FilterSelection = current
): boolean {
  const text = selection.text?.trim().toLowerCase();
  if (text) {
    const haystack = `${issue.title} ${issue.description}`.toLowerCase();
    if (!haystack.includes(text)) return false;
  }

  if (selection.labels?.length && !selection.labels.some(key => labelKeys.includes(key))) {
    return false;
  }

  if (selection.priorities?.length) {
    const rank = issue.priority ?? "none";
    if (!selection.priorities.includes(rank)) return false;
  }

  if (selection.assignees?.length && !selection.assignees.some(id => assigneeIds.includes(id))) {
    return false;
  }

  if (selection.statuses?.length && !selection.statuses.includes(issue.status)) {
    return false;
  }

  return true;
}
