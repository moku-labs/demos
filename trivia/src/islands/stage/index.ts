/**
 * @file stage island — WIRING ONLY: assembles the `createIsland` spec from the sibling concern files
 * (a flat, one-job-per-file layout that mirrors the framework's own islands):
 *
 * - types.ts     — StageState/StageContext
 * - state.ts     — initState (the createState factory: a pristine lobby snapshot)
 * - lifecycle.ts — onMount: boot the stage role + wire the bridge subscriptions
 * - render.tsx   — the persistent TV frame + per-phase screen dispatch
 *
 * The host is `data-island="stage"` (mounted in {@link file://../../pages/StagePage.tsx}). A persistent
 * render-island that never empty-renders (keeps the Preact subtree mounted across phases). DOM glue only
 * — the host clock + all authoritative game logic live in the room plugins; this island reads + displays.
 */
import { createIsland } from "@moku-labs/web/browser";
import { startStageIsland } from "./lifecycle";
import { render } from "./render";
import { initState } from "./state";
import type { StageState } from "./types";

/** TV stage island: boots the host, then renders the current match phase from the room bridge. */
export const stageIsland = createIsland<StageState>("stage", {
  state: initState,
  onMount: startStageIsland,
  render
});

export type { StageState } from "./types";
