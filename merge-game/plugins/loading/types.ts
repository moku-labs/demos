/**
 * @file The config of the `loading` plugin.
 */

/**
 * The edge of the flow that asks for the failed bundles once more.
 *
 * @example
 * ```ts
 * const retry: RetryTrigger = { node: "splash", outcome: "retry" };
 * ```
 */
export type RetryTrigger = {
  /** The node the edge leaves. */
  node: string;
  /** The outcome the node takes. */
  outcome: string;
};

/**
 * What the app passes in `pluginConfigs.loading`.
 *
 * @example
 * ```ts
 * const config: LoadingConfig = {
 *   bundles: ["home", "board", "orders"],
 *   retry: { node: "splash", outcome: "retry" }
 * };
 * ```
 */
export type LoadingConfig = {
  /** The bundles the splash waits for. None by default: `loaded` goes out at once. */
  bundles: readonly string[];
  /** The edge that loads the failed bundles again. Left out, no edge retries. */
  retry?: RetryTrigger;
};
