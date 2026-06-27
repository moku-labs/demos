/**
 * @file stage island — onMount: boot the room stage role and wire the live subscriptions. DOM glue only;
 * the host clock + all authoritative game logic live in the room plugins — this island reads + displays.
 */
import { onLifecycle, qr, startStage, stats, subscribe } from "../../lib/room";
import type { StageContext } from "./types";

/**
 * Boot the stage role and wire the live subscriptions: snapshot → state, lifecycle → reconnect strip,
 * a 250 ms ticker so deadline-driven UI (timer ring, countdowns) re-renders, and a one-shot QR fetch.
 *
 * @param ctx - The island context (provides `set` + `cleanup`).
 * @example
 * ```ts
 * createIsland("stage", { onMount: startStageIsland });
 * ```
 */
export async function startStageIsland(ctx: StageContext): Promise<void> {
  ctx.cleanup(
    subscribe(s => {
      // eslint-disable-next-line unicorn/no-null -- the bridge's end-stats vocabulary is null until final
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
