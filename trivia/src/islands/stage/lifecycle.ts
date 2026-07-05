/**
 * @file stage island — onMount: boot the room stage role and wire the live subscriptions. DOM glue only;
 * the host clock + all authoritative game logic live in the room plugins — this island reads + displays.
 */
import { fetchBuildInfo } from "../../lib/build-info";
import { qr, startStage, stats, subscribe } from "../../lib/room";
import { startSoundDirector } from "../../lib/sound";
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

  // The TV carries the music + all the drama: a state-diff director turns every phase/score/steal
  // transition into sound (the phone runs its own controller-surface director).
  ctx.cleanup(startSoundDirector("stage"));

  try {
    const descriptor = await startStage();
    ctx.set({ code: descriptor.code });
    ctx.set({ qr: await qr() });
  } catch {
    // A boot/connect failure surfaces through the reconnect-strip island.
  }

  // Fetch the running build's git identity for the lobby version badge — AFTER the room boot so it never
  // delays it. `fetchBuildInfo` resolves `null` (never rejects) if `/build-info.json` is absent/unreachable,
  // so the badge simply stays hidden and this never throws.
  const buildInfo = await fetchBuildInfo();
  if (buildInfo) ctx.set({ buildInfo });
}
