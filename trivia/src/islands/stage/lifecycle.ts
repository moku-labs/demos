/**
 * @file stage island — onMount: boot the room stage role and wire the live subscriptions. DOM glue only;
 * the host clock + all authoritative game logic live in the room plugins — this island reads + displays.
 */
import { qr, startStage, stats, subscribe } from "../../lib/room";
import type { StageContext } from "./types";

/**
 * Boot the stage role and wire the live subscriptions: snapshot → state, a 250 ms ticker so
 * deadline-driven UI (timer ring, countdowns) re-renders, and a one-shot QR fetch. The transient
 * overlays (reconnect/disconnect/pause/mute) are their own islands and subscribe independently.
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
      ctx.set({ s, endStats });
    })
  );

  const ticker = setInterval(() => ctx.set({ now: Date.now() }), 250);
  ctx.cleanup(() => clearInterval(ticker));

  try {
    const descriptor = await startStage();
    ctx.set({ code: descriptor.code });
    ctx.set({ qr: await qr() });
  } catch {
    // A boot/connect failure surfaces through the reconnect-strip island.
  }
}
