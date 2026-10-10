/**
 * @file The state factory of the plugin `loadProgress`.
 */
import type { Config, State } from "./types";

/**
 * Builds the starting state: every configured bundle at zero.
 *
 * @param config - The plugin config.
 * @returns The state.
 */
export function createLoadProgressState(config: Config): State {
  return {
    fractions: Object.fromEntries(config.bundles.map(bundle => [bundle, 0])),
    lastPosted: 0,
    ready: false
  };
}
