/**
 * @file The counter component: the number a HUD pill shows, tweened by the engine like any other
 * component.
 */
import { component } from "@moku-labs/game";

/** The number the counter shows. A component, so the engine can tween it like a position. */
export const Counter = component("Counter", { value: 0 });
