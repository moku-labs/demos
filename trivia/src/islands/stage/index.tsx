/**
 * @file stage island — the TV/shared-screen surface. A persistent render-island that boots the room
 * stage role, subscribes to the bridge snapshot, and renders the current match phase via {@link StageView}.
 * Never empty-renders (keeps the Preact subtree mounted across phases). DOM glue only — the host clock
 * and all authoritative game logic live in the room plugins; this island only reads + displays.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { onLifecycle, qr, snapshot, startStage, stats, subscribe } from "../../lib/room";
import { type StageState, StageView } from "./StageView";

/**
 * Build the initial stage state (a pristine lobby snapshot; the room boots in `onMount`).
 *
 * @returns The initial stage state.
 * @example
 * ```ts
 * createIsland("stage", { state: initState });
 * ```
 */
function initState(): StageState {
  return {
    s: snapshot(),
    muted: false,
    qr: null,
    code: "",
    now: Date.now(),
    reconnecting: false,
    dismissedDisconnect: false,
    endStats: null
  };
}

/**
 * Boot the stage role and wire the live subscriptions: snapshot → state, lifecycle → reconnect strip,
 * a 250 ms ticker so deadline-driven UI (timer ring, countdowns) re-renders, and a one-shot QR fetch.
 *
 * @param ctx - The island context (provides `set` + `cleanup`).
 * @example
 * ```ts
 * createIsland("stage", { onMount });
 * ```
 */
async function onMount(ctx: Spa.IslandContext<StageState>): Promise<void> {
  ctx.cleanup(
    subscribe(s => {
      const endStats = s.match.phase === "final" ? stats() : null;
      const dismissedDisconnect = s.players.some(p => !p.connected)
        ? ctx.state.dismissedDisconnect
        : false;
      ctx.set({ s, endStats, dismissedDisconnect });
    })
  );
  ctx.cleanup(
    onLifecycle(event => {
      if (event.kind === "network-warning") ctx.set({ reconnecting: true });
      else if (event.kind === "sync-ready") ctx.set({ reconnecting: false });
    })
  );

  const ticker = setInterval(() => ctx.set({ now: Date.now() }), 250);
  ctx.cleanup(() => clearInterval(ticker));

  try {
    const descriptor = await startStage();
    ctx.set({ code: descriptor.code });
    ctx.set({ qr: await qr() });
  } catch {
    // A boot/connect failure surfaces through the lifecycle reconnect strip.
  }
}

/**
 * Render the TV surface for the current state.
 *
 * @param state - The current stage state.
 * @param ctx - The island context (for the mute + dismiss callbacks).
 * @returns The stage view.
 * @example
 * ```ts
 * createIsland("stage", { render });
 * ```
 */
function render(state: Readonly<StageState>, ctx: Spa.IslandContext<StageState>): Spa.RenderResult {
  return h(StageView, {
    state,
    onMute: () => ctx.set({ muted: !state.muted }),
    onDismissDisconnect: () => ctx.set({ dismissedDisconnect: true })
  });
}

/** TV stage island: boots the host, then renders the current match phase from the room bridge. */
export const stageIsland = createIsland<StageState>("stage", { state: initState, onMount, render });
