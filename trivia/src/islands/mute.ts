/**
 * @file mute island — the TV mute control (B1). A standalone behaviour island mounted on the persistent
 * `[data-island="mute"]` host (a fixed top-right control). It drives the real audio engine: the pill
 * reflects + toggles the persisted mute flag (`sound.setMuted`), unlocks the AudioContext on the tap (the
 * gesture the browser autoplay policy needs), and gives a little "unmuted" blip as confirmation.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { MuteButton } from "../components/MuteButton";
import { sound } from "../lib/sound";

/** Per-instance mute state — the toggle's pressed look (seeded from the persisted engine flag). */
type MuteState = { muted: boolean };

/**
 * Build the initial state from the persisted engine mute flag (so the pill survives a reload).
 *
 * @returns The initial mute state.
 * @example
 * ```ts
 * createIsland("mute", { state: initState });
 * ```
 */
function initState(): MuteState {
  return { muted: sound.isMuted() };
}

/**
 * Toggle audio on/off: flip + persist the engine flag, unlock the context on this gesture, and play a
 * confirmation blip when un-muting (muting is, by definition, silent).
 *
 * @param state - The current mute state.
 * @param ctx - The island context (to update the pressed look).
 * @example
 * ```ts
 * onToggle: () => toggle(state, ctx);
 * ```
 */
function toggle(state: Readonly<MuteState>, ctx: Spa.IslandContext<MuteState>): void {
  const next = !state.muted;
  sound.unlock();
  sound.setMuted(next);
  if (!next) sound.play("ui.mute.off");
  ctx.set({ muted: next });
}

/**
 * Render the mute pill, driving the audio engine on click.
 *
 * @param state - The current mute state.
 * @param ctx - The island context (for the toggle).
 * @returns The mute button.
 * @example
 * ```ts
 * createIsland("mute", { render });
 * ```
 */
function render(state: Readonly<MuteState>, ctx: Spa.IslandContext<MuteState>): Spa.RenderResult {
  return h(MuteButton, {
    muted: state.muted,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding toggle
    onToggle: () => toggle(state, ctx)
  });
}

/** TV mute control island (fixed top-right; drives the WebAudio engine's persisted mute flag). */
export const muteIsland = createIsland<MuteState>("mute", { state: initState, render });
