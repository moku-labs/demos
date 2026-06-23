/**
 * @file board island — Complex-tier WIRING ONLY: assembles the `createIsland` spec and re-exports the
 * island's public surface. All logic lives in the sibling files (a flat, one-job-per-file layout that
 * mirrors the framework's own spa plugin):
 *
 * - types.ts      — BoardState/BoardContext + constants
 * - state.ts      — initState (the createState factory)
 * - render.ts     — render-on-change: board view ↔ list view, filter-narrowed
 * - reconcile.ts  — applyPatch: how the SERVER drives the board (realtime reconcile, exhaustive)
 * - handlers.ts   — how the USER drives the board (delegated interaction handlers)
 * - events.ts     — the boardEvents map (selector → handler)
 * - lifecycle.ts  — onMount + the nav sync: load + connect + seed + wire + deep-link focus
 * - snapshot.ts   — pure issue/column transforms + filter-narrowing (ctx-free, unit-tested)
 *
 * The host is `data-island="board"` (mounted in {@link file://../../pages/BoardPage.tsx}). Because the
 * board lives inside BoardPage it is re-mounted on navigation, AND it persists across the board↔list
 * view flip — so the same idempotent `sync` runs from both `onMount` and `onNavEnd`.
 */
import { createIsland } from "@moku-labs/web/browser";
import { boardEvents } from "./events";
import { startBoard, sync } from "./lifecycle";
import { render } from "./render";
import { initState } from "./state";
import type { BoardState } from "./types";

export { applyPatch } from "./reconcile";

/** Board-page island: renders the live board / list, and drives every board interaction. */
export const board = createIsland<BoardState>("board", {
  state: initState,
  render,
  onMount: startBoard,
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the nav-end re-sync
  onNavEnd: ctx => void sync(ctx),
  events: boardEvents
});

export type { BoardState } from "./types";
