/**
 * @file reconnect-strip island — the transient network-warning strip (D3). A standalone behaviour island
 * that subscribes to the bridge lifecycle and renders {@link ReconnectStrip} into its persistent
 * `[data-island="reconnect-strip"]` host while a reconnect is in flight (network-warning → shown,
 * sync-ready → hidden). Idle → an empty render + the host is hidden.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { ReconnectStrip } from "../components/ReconnectStrip";
import { onLifecycle } from "../lib/room";

/** Per-instance state — whether a reconnect is currently in flight. */
type StripState = { reconnecting: boolean };

/** The reconnect-strip island context. */
type StripContext = Spa.IslandContext<StripState>;

/**
 * Build the initial state (not reconnecting).
 *
 * @returns The initial strip state.
 * @example
 * ```ts
 * createIsland("reconnect-strip", { state: initState });
 * ```
 */
function initState(): StripState {
  return { reconnecting: false };
}

/**
 * Render the reconnect strip while a reconnect is in flight, or nothing otherwise.
 *
 * @param state - The current strip state.
 * @returns The reconnect strip, or an empty fragment when idle.
 * @example
 * ```ts
 * createIsland("reconnect-strip", { render });
 * ```
 */
function render(state: Readonly<StripState>): Spa.RenderResult {
  return state.reconnecting ? h(ReconnectStrip, {}) : h(Fragment, {});
}

/**
 * Subscribe to the bridge lifecycle; show the strip on a network warning and hide it once sync recovers.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * createIsland("reconnect-strip", { onMount: mount });
 * ```
 */
function mount(ctx: StripContext): void {
  ctx.el.toggleAttribute("hidden", true);
  ctx.cleanup(
    onLifecycle(event => {
      if (event.kind === "network-warning") {
        ctx.set({ reconnecting: true });
        ctx.el.toggleAttribute("hidden", false);
      } else if (event.kind === "sync-ready") {
        ctx.set({ reconnecting: false });
        ctx.el.toggleAttribute("hidden", true);
      }
    })
  );
}

/** Transient network-warning strip island (a fixed top strip). */
export const reconnectStripIsland = createIsland<StripState>("reconnect-strip", {
  state: initState,
  render,
  onMount: mount
});
