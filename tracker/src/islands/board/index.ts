/**
 * @file board island — Complex-tier WIRING ONLY: assembles the createComponent spec and re-exports
 * the island's public surface. All logic lives in the sibling files (a flat, one-job-per-file layout
 * that mirrors the framework's own spa plugin):
 *
 * - types.ts                    — BoardState/BoardContext + constants
 * - state.ts                    — initState (the createState factory)
 * - render.ts                   — the render-on-change view binding
 * - reconcile.ts                — applyPatch: how the SERVER drives the board (realtime reconcile)
 * - handlers.ts                 — how the USER drives the board (delegated interaction handlers)
 * - events.ts                   — the boardEvents map (selector → handler)
 * - preview.ts                  — the body-level attachment preview overlay (off-host render)
 * - lifecycle.ts                — onMount: load + connect + seed + wire + focus
 * - ../../lib/board-snapshot.ts — the pure card/column/attachment transforms (ctx-free)
 */
import { createComponent } from "@moku-labs/web/browser";
import { boardEvents } from "./events";
import { startBoard } from "./lifecycle";
import { render } from "./render";
import { initState } from "./state";
import type { BoardState } from "./types";

export { applyPatch } from "./reconcile";


/** Board-page island: renders the live board and drives the proof loop. */
export const board = createComponent<BoardState>("board", {
  state: initState,
  render,
  onMount: startBoard,
  events: boardEvents
});

export {type BoardState} from "./types";
