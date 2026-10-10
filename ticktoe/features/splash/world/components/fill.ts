/**
 * @file The marker of the loading bar: how much of the fill shows.
 */
import { component } from "@moku-labs/game";

/**
 * How much is loaded, 0..1, carried by the fill of the loading bar. The layout of the fill never
 * changes; a change of this number is what its `change` hook hears and tweens.
 */
export const Fill = component("Fill", { pct: 0 });
