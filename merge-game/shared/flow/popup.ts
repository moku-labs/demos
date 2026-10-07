/**
 * @file How a node shows a popup: the swing-in sound, and `showPopup`, which plays it and opens the
 * popup through the node's effects.
 */
import type { Flow } from "@moku-labs/game";
import { sfx } from "@moku-labs/game";

/** The sound a popup board makes as it swings in (design §6 F1). */
export const popupSound = sfx("ui.sounds.popup");

/**
 * Shows a popup that comes in: plays its swing sound once and awaits the popup. A node that shows
 * the same popup again after a transit (Settings after a volume step) awaits the popup alone,
 * because the board is taken back and does not swing in again.
 *
 * @param fx - The effects of the node.
 * @param descriptor - The popup: `popup(Component, props, options?)`.
 * @returns What the popup answered.
 */
export function showPopup(fx: Flow.NodeFx, descriptor: Flow.Descriptor): Promise<unknown> {
  void fx(popupSound);

  return fx(descriptor);
}
