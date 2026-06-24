/**
 * @file Presentation metadata for the issue taxonomy — label names, priority ranks, and status
 * titles. Pure, browser- + server-safe constants (no platform imports). The COLOURS live in CSS
 * tokens (`--label-*`) selected by `data-label`; this module owns only the human-readable text and
 * the priority bar-count, so labels/priorities/statuses read consistently across the card, the list,
 * the filter, and the issue rail. (design context §2 colour list + §3 hierarchy.)
 */
import type { IssueStatus, LabelKey, Priority } from "./types";

/** Display name for each label key (its dot colour is `var(--label-<key>)`, set via `data-label`). */
export const LABELS: Record<LabelKey, string> = {
  bug: "Bug",
  feature: "Feature",
  chore: "Chore",
  research: "Research",
  design: "Design",
  docs: "Docs"
};

/** All label keys, in display order. */
export const LABEL_KEYS: readonly LabelKey[] = [
  "bug",
  "feature",
  "chore",
  "research",
  "design",
  "docs"
];

/** Display name for each priority rank. */
export const PRIORITIES: Record<Exclude<Priority, "none">, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low"
};

/**
 * Filled-bar count (1–4) for the ascending-bars priority mark; `none` renders no mark. Urgent (4) is
 * the only rank tinted vermilion (design context §2 "Priority").
 */
export const PRIORITY_BARS: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0
};

/** Column / status titles, in board order (Backlog → In Progress → In Review → Done). */
export const STATUS_TITLES: Record<IssueStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done"
};

/** All statuses, in board order. */
export const STATUS_ORDER: readonly IssueStatus[] = ["backlog", "in_progress", "in_review", "done"];

/**
 * Map a column title to its canonical issue status — the four seeded titles map back to a status; any
 * other (custom) column title has no canonical status, so the caller keeps the issue's existing one.
 * This is the single source of truth the board drop, the column header, and the issue Status picker
 * share, so a card moved into a custom column behaves identically however it is moved.
 *
 * @param title - The column title to map.
 * @returns The matching status, or `undefined` for a custom column.
 * @example
 * ```ts
 * statusForColumnTitle("In Review"); // "in_review"
 * statusForColumnTitle("QA gate");   // undefined
 * ```
 */
export function statusForColumnTitle(title: string): IssueStatus | undefined {
  return STATUS_ORDER.find(status => STATUS_TITLES[status] === title);
}
