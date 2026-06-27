/**
 * @file controller island — WIRING ONLY: assembles the `createIsland` spec from the sibling concern files
 * (a flat, one-job-per-file layout that mirrors the framework's own islands):
 *
 * - types.ts     — ControllerState/ControllerContext
 * - state.ts     — initState (the createState factory: a pristine snapshot)
 * - lifecycle.ts — onMount: join the room (deep-link code) + wire the bridge subscriptions + seed history
 * - render.tsx   — the phone frame + per-phase/role screen dispatch + the per-intent callbacks
 *
 * The host is `data-island="controller"` (mounted in {@link file://../../pages/ControllerPage.tsx}). A
 * persistent render-island that joins the room and renders the current phase + this player's role. Every
 * player action is sent to the host as an intent over the Wire; the host is authoritative.
 */
import { createIsland } from "@moku-labs/web/browser";
import { startControllerIsland } from "./lifecycle";
import { render } from "./render";
import { initState } from "./state";
import type { ControllerState } from "./types";

/** Phone controller island: joins the room, then renders the current phase + role from the bridge. */
export const controllerIsland = createIsland<ControllerState>("controller", {
  state: initState,
  onMount: startControllerIsland,
  render
});

export type { ControllerState } from "./types";
