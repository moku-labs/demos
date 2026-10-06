/**
 * @file What the splash waits for, as plain data and pure functions: the bundles of the config,
 * how far each one has come, the share of the whole, and the bundles that failed and wait for a
 * retry. The plugin in `index.ts` feeds it from the asset events and posts what it
 * computes into the flow inbox.
 */

/**
 * How far the loading has come.
 *
 * @example
 * ```ts
 * const state: LoadingState = {
 *   bundles: ["home", "board"], shares: { home: 1, board: 0.5 }, loaded: ["home"], failed: [],
 *   posted: false, reported: 0.75
 * };
 * ```
 */
export type LoadingState = {
  /** The bundles the splash waits for, from the config. */
  bundles: readonly string[];
  /** The share of each watched bundle that has settled, 0..1. */
  shares: Record<string, number>;
  /** The watched bundles that are loaded. */
  loaded: string[];
  /** The watched bundles whose load failed since the last retry. */
  failed: string[];
  /** Whether `loaded` went into the inbox. After it nothing is posted any more. */
  posted: boolean;
  /** The share last posted, so the same number is never posted twice. */
  reported: number;
};

/**
 * The state of a splash that has seen nothing yet.
 *
 * @param bundles - The bundles to wait for. None by default.
 * @returns A fresh state.
 * @example
 * ```ts
 * createLoadingState(["home"]); // { bundles: ["home"], shares: {}, loaded: [], failed: [], posted: false, reported: -1 }
 * ```
 */
export function createLoadingState(bundles: readonly string[] = []): LoadingState {
  return { bundles, shares: {}, loaded: [], failed: [], posted: false, reported: -1 };
}

/**
 * Whether the splash watches a bundle.
 *
 * @param state - The loading state.
 * @param bundle - The bundle an event named.
 * @returns True for a bundle of the config.
 * @example
 * ```ts
 * isWatched(createLoadingState(["home"]), "ui"); // false
 * ```
 */
export function isWatched(state: LoadingState, bundle: string): boolean {
  return state.bundles.includes(bundle);
}

/**
 * Records one file that settled. A loaded bundle keeps its full share, whatever a later load of
 * it says.
 *
 * @param state - The loading state.
 * @param bundle - The bundle the file belongs to.
 * @param share - The settled files of the bundle over its file count.
 */
export function recordProgress(state: LoadingState, bundle: string, share: number): void {
  if (state.loaded.includes(bundle)) return;

  state.shares[bundle] = Math.min(1, Math.max(0, share));
}

/**
 * Records a bundle that is loaded.
 *
 * @param state - The loading state.
 * @param bundle - The bundle that is in.
 */
export function recordLoaded(state: LoadingState, bundle: string): void {
  state.shares[bundle] = 1;

  if (!state.loaded.includes(bundle)) state.loaded.push(bundle);
}

/**
 * The share of the whole: the mean of the watched bundles, on two decimals. With no bundle to
 * wait for, everything is in.
 *
 * @param state - The loading state.
 * @returns 0..1.
 * @example
 * ```ts
 * shareOf({ bundles: ["home", "board"], shares: { home: 1, board: 0.5 }, loaded: ["home"], failed: [], posted: false, reported: 0 }); // 0.75
 * ```
 */
export function shareOf(state: LoadingState): number {
  if (state.bundles.length === 0) return 1;

  const sum = state.bundles.reduce((total, bundle) => total + (state.shares[bundle] ?? 0), 0);

  return Math.round((sum / state.bundles.length) * 100) / 100;
}

/**
 * Whether every watched bundle is loaded.
 *
 * @param state - The loading state.
 * @returns True when every watched bundle is in, and at once when there is none.
 */
export function isComplete(state: LoadingState): boolean {
  return state.bundles.every(bundle => state.loaded.includes(bundle));
}

/**
 * Records a bundle whose load failed. Only the first failure since the last retry asks for the
 * retry line: the line is up already for the next one.
 *
 * @param state - The loading state.
 * @param bundle - The bundle that failed.
 * @returns True when the splash has to be told.
 * @example
 * ```ts
 * recordFailed(createLoadingState(["board"]), "board"); // true
 * ```
 */
export function recordFailed(state: LoadingState, bundle: string): boolean {
  const first = state.failed.length === 0;

  if (!state.failed.includes(bundle)) state.failed.push(bundle);

  return first;
}

/**
 * Takes the failed bundles for a retry: their shares go back to nothing, because a failed file
 * counted as settled, and the share is reported again from there.
 *
 * @param state - The loading state.
 * @returns The bundles to load again.
 * @example
 * ```ts
 * const state = createLoadingState(["board"]);
 * recordFailed(state, "board");
 * retryFailed(state); // ["board"], and state.failed is [] again
 * ```
 */
export function retryFailed(state: LoadingState): string[] {
  const bundles = state.failed;

  state.failed = [];
  state.reported = -1;

  for (const bundle of bundles) state.shares[bundle] = 0;

  return bundles;
}
