/**
 * @file pause-overlay island — the host-reconnect pause takeover (C2). A standalone behaviour island that
 * subscribes to the bridge snapshot and renders {@link PauseOverlay} into its persistent
 * `[data-island="pause-overlay"]` host while `match.paused` is set. Idle → an empty render + the host is
 * hidden (so the full-screen backdrop never blocks the stage when not paused).
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { PauseOverlay } from "../components/PauseOverlay";
import { snapshot, subscribe } from "../lib/room";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";

/** Per-instance state — the latest snapshot (read for `match.paused` + the host name). */
type PauseState = { s: TriviaState };

/** The pause-overlay island context. */
type PauseContext = Spa.IslandContext<PauseState>;

/**
 * Build the initial state (current snapshot).
 *
 * @returns The initial pause state.
 * @example
 * ```ts
 * createIsland("pause-overlay", { state: initState });
 * ```
 */
function initState(): PauseState {
  return { s: snapshot() };
}

/**
 * Render the pause takeover while paused, or nothing otherwise.
 *
 * @param state - The current pause state.
 * @returns The pause overlay, or an empty fragment when not paused.
 * @example
 * ```ts
 * createIsland("pause-overlay", { render });
 * ```
 */
function render(state: Readonly<PauseState>): Spa.RenderResult {
  if (!state.s.match.paused) return h(Fragment, {});
  const host = findPlayer(state.s.players, state.s.match.hostPeer);
  return h(PauseOverlay, host?.name ? { name: host.name } : {});
}

/**
 * Subscribe to the bridge snapshot; show the pause takeover whenever `match.paused` is set.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * createIsland("pause-overlay", { onMount: mount });
 * ```
 */
function mount(ctx: PauseContext): void {
  ctx.el.toggleAttribute("hidden", true);
  ctx.cleanup(
    subscribe(s => {
      ctx.set({ s });
      ctx.el.toggleAttribute("hidden", !s.match.paused);
    })
  );
}

/** Host-reconnect pause-takeover island (a fixed full-screen overlay). */
export const pauseOverlayIsland = createIsland<PauseState>("pause-overlay", {
  state: initState,
  render,
  onMount: mount
});
