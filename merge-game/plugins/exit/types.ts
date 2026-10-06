/**
 * @file The config of the `exit` plugin.
 */

/**
 * What the app passes in `pluginConfigs.exit`: how the app is left.
 *
 * @example
 * ```ts
 * const config: ExitConfig = { exit: () => platform.exit() };
 * ```
 */
export type ExitConfig = {
  /** Leaves the app: the provider's `exit()` in the native shell. Does nothing by default. */
  exit: () => void;
};
