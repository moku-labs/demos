/**
 * @file mute island — the TV audio controls (B1). A standalone behaviour island mounted on the persistent
 * `[data-island="mute"]` host (a fixed top-right control). It drives the real audio engine via TWO pills —
 * **Music** and **SFX** — so the group can play with music, sound effects, or both. Each pill reflects +
 * toggles its persisted channel flag (`sound.setMusicMuted` / `sound.setSfxMuted`), unlocks the
 * AudioContext on the tap (the gesture the browser autoplay policy needs), and (for SFX) gives a little
 * "unmuted" blip as confirmation when re-enabled.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { MuteButton } from "../components/MuteButton";
import { sound } from "../lib/sound";

/** Per-instance state — the two pills' pressed look (seeded from the persisted engine flags). */
type MuteState = { sfxMuted: boolean; musicMuted: boolean };

/**
 * Build the initial state from the persisted engine flags (so both pills survive a reload).
 *
 * @returns The initial mute state.
 * @example
 * ```ts
 * createIsland("mute", { state: initState });
 * ```
 */
function initState(): MuteState {
  return { sfxMuted: sound.isSfxMuted(), musicMuted: sound.isMusicMuted() };
}

/**
 * Toggle the SFX channel: unlock the context on this gesture, flip + persist the engine flag, play a
 * confirmation blip when un-muting (muting is, by definition, silent), and update the pill.
 *
 * @param state - The current mute state.
 * @param ctx - The island context (to update the pressed look).
 * @example
 * ```ts
 * onToggle: () => toggleSfx(state, ctx);
 * ```
 */
function toggleSfx(state: Readonly<MuteState>, ctx: Spa.IslandContext<MuteState>): void {
  const next = !state.sfxMuted;
  sound.unlock();
  sound.setSfxMuted(next);
  if (!next) sound.play("ui.mute.off");
  ctx.set({ sfxMuted: next });
}

/**
 * Toggle the Music channel: unlock the context on this gesture, flip + persist the engine flag, and
 * update the pill. Un-muting restores the music bus; the next director cue re-starts a bed.
 *
 * @param state - The current mute state.
 * @param ctx - The island context (to update the pressed look).
 * @example
 * ```ts
 * onToggle: () => toggleMusic(state, ctx);
 * ```
 */
function toggleMusic(state: Readonly<MuteState>, ctx: Spa.IslandContext<MuteState>): void {
  const next = !state.musicMuted;
  sound.unlock();
  sound.setMusicMuted(next);
  ctx.set({ musicMuted: next });
}

/**
 * Render the two audio-channel pills (Music + SFX), each driving the engine on click.
 *
 * @param state - The current mute state.
 * @param ctx - The island context (for the toggles).
 * @returns The audio-toggles row.
 * @example
 * ```ts
 * createIsland("mute", { render });
 * ```
 */
function render(state: Readonly<MuteState>, ctx: Spa.IslandContext<MuteState>): Spa.RenderResult {
  return h("div", { "data-component": "audio-toggles" }, [
    h(MuteButton, {
      key: "music",
      on: !state.musicMuted,
      label: "Music",
      icon: "🎵",
      // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding toggle
      onToggle: () => toggleMusic(state, ctx)
    }),
    h(MuteButton, {
      key: "sfx",
      on: !state.sfxMuted,
      label: "SFX",
      icon: "🔊",
      // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding toggle
      onToggle: () => toggleSfx(state, ctx)
    })
  ]);
}

/** TV audio controls island (fixed top-right; two pills driving the engine's persisted channel flags). */
export const muteIsland = createIsland<MuteState>("mute", { state: initState, render });
