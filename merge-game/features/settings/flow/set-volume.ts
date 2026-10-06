/**
 * @file Transit node `setVolume`: − or + on a bus moves it one step, within its range.
 */
import { type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import type { VolumeInput } from "../types";

/** The quietest and the loudest a bus can be set to from the popup. */
const range = { min: 0, max: 1 };

/**
 * Keeps a volume inside its range and on two decimals, so a save never holds the rounding error
 * of a step: 0.6 minus 0.1 is 0.5 in the file the player carries around.
 *
 * @param value - The volume after the step was added.
 * @returns The volume the save takes.
 * @example
 * ```ts
 * clamp(0.6 - 0.1); // 0.5
 * clamp(1.1); // 1
 * ```
 */
function clamp(value: number): number {
  const inside = Math.min(range.max, Math.max(range.min, value));

  return Math.round(inside * 100) / 100;
}

/**
 * Reads the volume change out of the answer of the popup.
 *
 * @param payload - What the button carried.
 * @returns The bus and the step, `music` and nothing when the answer carried neither.
 */
export function volumeOf(payload: unknown): VolumeInput {
  const answer = payload as Partial<VolumeInput> | undefined;

  return {
    bus: typeof answer?.bus === "string" ? answer.bus : "music",
    delta: typeof answer?.delta === "number" ? answer.delta : 0
  };
}

/**
 * Transit node `setVolume`: writes the new gain into the save. Nothing calls the audio plugin —
 * `pluginConfigs.audio.volumes` reads the committed player and applies it.
 */
export const setVolume = defineNode({
  input: type<VolumeInput>(),
  outcomes: { done: type() },
  run: ({ input, player, out }) => {
    const audio = player.settings.audio;

    if (input.bus === "sfx") audio.sfx = clamp(audio.sfx + input.delta);
    else audio.music = clamp(audio.music + input.delta);

    return out.done();
  }
});
