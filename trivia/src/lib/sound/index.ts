/**
 * @file Public sound surface — the `sound` singleton the islands call directly (gesture SFX, haptics, the
 * mute pill) and {@link startSoundDirector}, which subscribes the room bridge and turns every state
 * transition into audio via the pure {@link diffCues} director. The only sound module the rest of the app
 * imports. Browser-only glue (owns timers + bridge subscriptions); excluded from unit coverage.
 *
 * Two channels feed the engine:
 * 1. **Reactive** — `startSoundDirector(surface)` diffs snapshots → cues (music beds on the TV, joins,
 *    reveal stings, scoreboard, fanfare, your-turn nudges) and maps `room:*` lifecycle to connection blips.
 * 2. **Direct** — interaction handlers call `sound.play(...)`/`sound.haptic(...)` at the gesture (tap,
 *    lock-in, pick, start), which also unlocks the AudioContext within the user gesture.
 */
import { onLifecycle, subscribe } from "../room";
import type { TriviaState } from "../types";
import { diffCues } from "./director";
import {
  haptic,
  isMusicMuted,
  isSfxMuted,
  music,
  play,
  setMusicMuted,
  setSfxMuted,
  stopMusic,
  unlock
} from "./engine";
import type { Cue, Surface } from "./types";

/**
 * The imperative sound surface (a thin re-export of the engine). Islands import this for gesture-driven
 * SFX/haptics and the two mute toggles (SFX + Music are independent channels); the reactive cues go
 * through {@link startSoundDirector}.
 */
export const sound = {
  play,
  haptic,
  music,
  stopMusic,
  setSfxMuted,
  setMusicMuted,
  isSfxMuted,
  isMusicMuted,
  unlock
} as const;

/** Ignore a scheduled cue whose deadline is absurdly far out (a clock-skew guard). */
const MAX_SCHEDULE_MS = 60_000;

/**
 * Start the reactive sound director for a surface: subscribe to the bridge snapshot + lifecycle streams,
 * translate each transition to {@link Cue}s, and execute them on the engine. Returns an unsubscribe that
 * also clears any pending scheduled cue.
 *
 * @param surface - `"stage"` (TV — music + all drama) or `"controller"` (phone — own nudges + flash).
 * @returns A teardown function (call from the island's `cleanup`).
 * @example
 * ```ts
 * ctx.cleanup(startSoundDirector("stage"));
 * ```
 */
export function startSoundDirector(surface: Surface): () => void {
  let previous: TriviaState | undefined;
  let urgentTimer: ReturnType<typeof setTimeout> | undefined;

  // eslint-disable-next-line jsdoc/require-jsdoc -- per-instance closure over urgentTimer
  const clearUrgent = (): void => {
    if (urgentTimer !== undefined) {
      clearTimeout(urgentTimer);
      urgentTimer = undefined;
    }
  };

  // eslint-disable-next-line jsdoc/require-jsdoc -- per-instance closure that executes one cue
  const execute = (cue: Cue): void => {
    switch (cue.kind) {
      case "sfx": {
        play(cue.id, cue.opts);
        break;
      }
      case "haptic": {
        haptic(cue.id);
        break;
      }
      case "music": {
        music(cue.id, cue.intensity);
        break;
      }
      default: {
        // A scheduled one-shot (the last-seconds timer urgency): fire at the absolute deadline.
        clearUrgent();
        const delay = cue.atTs - Date.now();
        if (delay > 0 && delay < MAX_SCHEDULE_MS)
          urgentTimer = setTimeout(() => play(cue.id), delay);
      }
    }
  };

  const offState = subscribe(next => {
    // Cancel a pending urgency once the timed window is over (e.g. the question resolved early).
    const stillTiming = next.match.phase === "question" || next.steal.active;
    if (!stillTiming) clearUrgent();

    for (const cue of diffCues(previous, next, surface)) execute(cue);
    previous = next;
  });

  const offLifecycle = onLifecycle(event => {
    switch (event.kind) {
      case "peer-left":
      case "network-warning": {
        play("conn.drop");
        break;
      }
      case "host-reconnecting": {
        play("conn.searching");
        break;
      }
      case "sync-ready": {
        play("conn.back");
        break;
      }
      default: {
        break;
      }
    }
  });

  return () => {
    offState();
    offLifecycle();
    clearUrgent();
  };
}
