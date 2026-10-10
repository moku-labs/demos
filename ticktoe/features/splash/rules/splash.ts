/**
 * @file When the splash may leave, and how much of the fill of its loading bar shows.
 */

/**
 * True when loading is done and the minimum time has passed.
 *
 * @param splash - The splash part of the session.
 * @param splash.ready - Loading is done.
 * @param splash.minPassed - The minimum time has passed.
 * @returns Whether the splash may leave.
 */
export function splashDone(splash: { ready: boolean; minPassed: boolean }): boolean {
  return splash.ready && splash.minPassed;
}

/**
 * How much of the fill of the loading bar shows for a loading fraction, in whole units. A
 * fraction outside 0..1 never leaves the track.
 *
 * @param pct - The loading fraction, 0..1.
 * @param full - The width of the fill when everything is loaded.
 * @returns The width of the part that shows.
 */
export function fillWidth(pct: number, full: number): number {
  const shown = Math.min(1, Math.max(0, pct));

  return Math.round(shown * full);
}
