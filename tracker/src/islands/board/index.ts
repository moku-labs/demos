/**
 * @file board island — wiring (the board-page controller + the demo's proof loop, D5/D7).
 *
 * Mounts on `[data-component="board"]`: renders the live board from typed per-instance state via
 * render-on-change, reconciles that state from Board Durable Object patches, and delegates every
 * interaction through declarative `events`. All logic lives in the sibling files — this only wires
 * the spec together and re-exports the pure helpers for direct unit tests.
 *
 * - types.ts     — BoardState/BoardContext + constants
 * - snapshot.ts  — pure card/column/attachment transforms + the realtime reconcile (applyPatch)
 * - render.ts    — initial state + the render-on-change view binding
 * - events.ts    — declarative delegated event handlers (boardEvents)
 * - preview.ts   — the body-level attachment preview overlay (off-host render)
 * - lifecycle.ts — onMount: load + connect + seed + wire + focus
 */
import { createComponent } from "@moku-labs/web/browser";
import { boardEvents } from "./events";
import { startBoard } from "./lifecycle";
import { initState, render } from "./render";
import type { BoardState } from "./types";

export {
  applyPatch,
  dropIndexInColumn,
  findAttachment,
  groupAttachmentsByCard,
  placeCardInColumn
} from "./snapshot";
export type { BoardState } from "./types";

/** Board-page island: renders the live board and drives the proof loop. */
export const board = createComponent<BoardState>("board", {
  state: initState,
  render,
  onMount: startBoard,
  events: boardEvents
});
