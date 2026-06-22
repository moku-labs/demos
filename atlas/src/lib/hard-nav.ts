/**
 * @file Hard-navigation escape hatch for the auth ↔ app layout boundary.
 *
 * The SPA swaps only the `main > section` region and keeps everything around it (the SiteLayout
 * masthead/boards-bar/footer OR the AuthLayout editorial split) as a SINGLE persistent shell — it
 * cannot turn the app chrome into the auth split (or back) on a client navigation. Crossing that
 * boundary therefore needs a real full-page load. But the SPA's Navigation-API interceptor catches
 * even a programmatic `location.assign`, converting it into a region swap — so a plain redirect lands
 * the sign-in form *inside* the app chrome (with the board islands 401-storming behind it).
 *
 * {@link hardNavigate} defeats that: it first tears the SPA down (which removes the navigation
 * interceptor via the spa kernel's `dispose`) and only THEN assigns `location`, guaranteeing a real
 * document load that renders the destination route's own layout. `spa.tsx` registers the teardown via
 * {@link registerHardNavigate} immediately after `app.start()`; until then we fall back to a plain
 * assign (only reachable before the app has booted, where no interceptor exists yet anyway).
 */

/** The registered "tear the SPA down, then assign location" navigator, or undefined pre-boot. */
let hardNavigator: ((url: string) => void | Promise<void>) | undefined;

/**
 * Register the boundary navigator — called once by `spa.tsx` right after `app.start()`.
 *
 * @param fn - Stops the SPA (removing the nav interceptor), then assigns `location` to the url.
 * @example
 * ```ts
 * registerHardNavigate(async url => { await app.stop(); globalThis.location.assign(url); });
 * ```
 */
export function registerHardNavigate(fn: (url: string) => void | Promise<void>): void {
  hardNavigator = fn;
}

/**
 * Cross the auth ↔ app layout boundary with a real full-page load (NOT an intercepted SPA swap).
 * Build `url` from the route map's `urls`, never a literal.
 *
 * @param url - The internal destination path (e.g. `urls.toUrl("signin", {})`).
 * @example
 * ```ts
 * hardNavigate(urls.toUrl("home", {})); // after sign-in: full load so the app chrome renders
 * ```
 */
export function hardNavigate(url: string): void {
  if (hardNavigator) {
    Promise.resolve(hardNavigator(url)).catch(() => {});
    return;
  }
  globalThis.location.assign(url);
}
