/**
 * @file Route map — ONE table for build, SPA nav, and link building. The app is a single screen, so
 * there is exactly one route; the deep-link scheme, not a second path, is how the outside world
 * reaches into it.
 */
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { AppLayout } from "./layouts/AppLayout";
import { HomePage } from "./pages/HomePage";

/** The addressable surfaces. */
export const routes = defineRoutes({
  home: route("/")
    .layout(AppLayout)
    .render(() => <HomePage />)
});

/**
 * App-free URL builder over the route map (the only sanctioned internal-link source).
 *
 * @example
 * ```ts
 * urls.toUrl("home", {}); // "/"
 * ```
 */
export const urls = createUrls(routes, "en");
