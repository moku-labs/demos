/**
 * @file disconnect-banner island — the transient drop notice. A standalone behaviour island that
 * subscribes to the bridge snapshot and renders {@link DisconnectBanner} into its persistent
 * `[data-island="disconnect-banner"]` host while a player is disconnected (until dismissed). Idle → an
 * empty render + the host is hidden (avoids the empty-render teardown; mirrors the framework toast island).
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { DisconnectBanner } from "../components/DisconnectBanner";
import { TRIVIA } from "../config";
import { snapshot, subscribe } from "../lib/room";
import type { TriviaState } from "../lib/types";

/** Per-instance state — the latest snapshot + whether the current drop was dismissed. */
type BannerState = { s: TriviaState; dismissed: boolean };

/** The disconnect-banner island context. */
type BannerContext = Spa.IslandContext<BannerState>;

/**
 * Build the initial state (current snapshot; not dismissed).
 *
 * @returns The initial banner state.
 * @example
 * ```ts
 * createIsland("disconnect-banner", { state: initState });
 * ```
 */
function initState(): BannerState {
  return { s: snapshot(), dismissed: false };
}

/**
 * Render the disconnect banner for the dropped player, or nothing while no one is dropped/dismissed.
 *
 * @param state - The current banner state.
 * @param ctx - The island context (for the dismiss callback + host hide).
 * @returns The disconnect banner, or an empty fragment when idle.
 * @example
 * ```ts
 * createIsland("disconnect-banner", { render });
 * ```
 */
function render(state: Readonly<BannerState>, ctx: BannerContext): Spa.RenderResult {
  const dropped = state.dismissed ? undefined : state.s.players.find(p => !p.connected);
  if (!dropped) return h(Fragment, {});

  return h(DisconnectBanner, {
    avatar: dropped.avatar,
    name: dropped.name,
    color: dropped.color,
    secondsLeft: TRIVIA.timers.stealMs / 1000,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding dismiss handler
    onDismiss: () => {
      ctx.set({ dismissed: true });
      ctx.el.toggleAttribute("hidden", true);
    }
  });
}

/**
 * Subscribe to the bridge snapshot; show the banner while a player is dropped (until dismissed), and
 * reset the dismiss flag once everyone is back.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * createIsland("disconnect-banner", { onMount: mount });
 * ```
 */
function mount(ctx: BannerContext): void {
  ctx.el.toggleAttribute("hidden", true);
  ctx.cleanup(
    subscribe(s => {
      const anyDropped = s.players.some(p => !p.connected);
      const dismissed = anyDropped ? ctx.state.dismissed : false;
      ctx.set({ s, dismissed });
      ctx.el.toggleAttribute("hidden", !(anyDropped && !dismissed));
    })
  );
}

/** Transient drop-notice island (a fixed top overlay; dismissible). */
export const disconnectBannerIsland = createIsland<BannerState>("disconnect-banner", {
  state: initState,
  render,
  onMount: mount
});
