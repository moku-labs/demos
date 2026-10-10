/**
 * @file The handlers of the plugin `loadProgress`: asset events in, inbox events out. Each one is a
 * pure function over the plugin state and a `post` callback; `index.ts` binds `post` to the inbox.
 */
import type { State } from "./types";

/**
 * Posts one event into the flow inbox: `progress` with the overall fraction, or `ready`.
 */
export type Post = (event: { type: "progress" | "ready"; payload?: { pct: number } }) => void;

/**
 * Computes the overall fraction: the mean over the configured bundles. The handlers call it only
 * after they found the bundle among the fractions, so there is always at least one.
 *
 * @param fractions - Fraction 0..1 per configured bundle.
 * @returns The mean, 0..1.
 * @example
 * ```ts
 * overallOf({ match: 1, splash: 0.5 }); // 0.75
 * ```
 */
function overallOf(fractions: State["fractions"]): number {
  const values = Object.values(fractions);
  let sum = 0;

  for (const value of values) sum += value;

  return sum / values.length;
}

/**
 * Posts `ready` on start when no bundle is configured, so a game without bundles to wait for never
 * hangs on the splash.
 *
 * @param state - The plugin state.
 * @param bundles - The configured bundles.
 * @param post - Posts into the flow inbox.
 * @returns {void} Nothing: what it has to say goes through `post`.
 */
export function onStart(state: State, bundles: readonly string[], post: Post): void {
  if (state.ready || bundles.length > 0) return;

  post({ type: "ready" });
  state.ready = true;
}

/**
 * Records the progress of one bundle and posts `progress` when the overall fraction grew by a step
 * since the last post. A bundle that is not configured is ignored, a bundle without files counts as
 * loaded, and nothing is posted after `ready`.
 *
 * @param state - The plugin state.
 * @param step - The smallest growth that posts.
 * @param payload - The asset event.
 * @param payload.bundle - The bundle that progressed.
 * @param payload.loaded - Files settled so far.
 * @param payload.total - Files of the bundle.
 * @param post - Posts into the flow inbox.
 * @returns {void} Nothing: what it has to say goes through `post`.
 */
export function onBundleProgress(
  state: State,
  step: number,
  payload: { bundle: string; loaded: number; total: number },
  post: Post
): void {
  if (state.ready || !Object.hasOwn(state.fractions, payload.bundle)) return;

  state.fractions[payload.bundle] = payload.total === 0 ? 1 : payload.loaded / payload.total;

  const overall = overallOf(state.fractions);

  if (overall < state.lastPosted + step) return;

  state.lastPosted = overall;
  post({ type: "progress", payload: { pct: overall } });
}

/**
 * Marks one bundle as loaded. When every configured bundle is loaded it posts the full bar and then
 * `ready`, once. A bundle that is not configured is ignored.
 *
 * @param state - The plugin state.
 * @param payload - The asset event.
 * @param payload.bundle - The bundle that finished.
 * @param post - Posts into the flow inbox.
 * @returns {void} Nothing: what it has to say goes through `post`.
 */
export function onBundleLoaded(state: State, payload: { bundle: string }, post: Post): void {
  if (!Object.hasOwn(state.fractions, payload.bundle)) return;

  state.fractions[payload.bundle] = 1;

  const isStillLoading = Object.values(state.fractions).some(fraction => fraction < 1);

  if (state.ready || isStillLoading) return;

  state.lastPosted = 1;
  post({ type: "progress", payload: { pct: 1 } });
  post({ type: "ready" });
  state.ready = true;
}
