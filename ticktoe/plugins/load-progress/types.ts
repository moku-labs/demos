/**
 * @file Types of the plugin `loadProgress`.
 */
import type { BundleKey } from "@generated/assets";

/**
 * What the splash waits for.
 */
export type Config = {
  /**
   * The bundles that must be loaded before `ready` is posted. A name the game does not have does
   * not compile: `ready` would never be posted for it.
   */
  bundles: readonly BundleKey[];
  /** Smallest growth of the overall fraction that posts one more `progress`, 0..1. */
  step: number;
};

/**
 * What the plugin remembers between events.
 */
export type State = {
  /** Fraction 0..1 per configured bundle. */
  fractions: Record<string, number>;
  /** The overall fraction of the last posted `progress`. */
  lastPosted: number;
  /** True once `ready` was posted. */
  ready: boolean;
};
