/**
 * @file mute island — the TV mute control (B1). A standalone behaviour island mounted on the persistent
 * `[data-island="mute"]` host (a fixed top-right control). Audio is out of scope for v1, so this only
 * toggles its own pressed state; no bridge subscription. Mirrors the framework theme-toggle (a chrome
 * control island), but renders its component (the mute pill) rather than authoring markup.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { MuteButton } from "../components/MuteButton";

/** Per-instance mute state — the toggle's pressed look. */
type MuteState = { muted: boolean };

/**
 * Build the initial (un-muted) state.
 *
 * @returns The initial mute state.
 * @example
 * ```ts
 * createIsland("mute", { state: initState });
 * ```
 */
function initState(): MuteState {
  return { muted: false };
}

/**
 * Render the mute pill, toggling the pressed state on click.
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
    onToggle: () => ctx.set({ muted: !state.muted })
  });
}

/** TV mute control island (fixed top-right; audio is out of scope for v1). */
export const muteIsland = createIsland<MuteState>("mute", { state: initState, render });
