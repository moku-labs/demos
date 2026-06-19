/**
 * @file Route table — `/` board list, `/b/{id}` board view (web Rule R2: one route table for build,
 * SPA navigation, and link building).
 *
 * Both routes share the SiteLayout chrome via `.layout()`; in SPA mode the chrome persists and only
 * the page `<section>` (the `main > section` swap region) is replaced on navigation.
 */

import type { Router } from "@moku-labs/web/browser";
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import type { ComponentChildren } from "preact";
import { SiteLayout } from "./layouts/SiteLayout";
import { BoardListPage } from "./pages/BoardListPage";
import { BoardPage } from "./pages/BoardPage";

/**
 * Wrap a rendered page in the shared SiteLayout chrome (applied at SSG render; the chrome persists
 * across SPA navigation).
 *
 * @param _ctx - The route layout context (unused — the chrome is route-agnostic here).
 * @param children - The rendered page content.
 * @returns The page wrapped in SiteLayout.
 * @example
 * ```tsx
 * route("/").layout(siteLayout).render(() => <BoardListPage />);
 * ```
 */
const siteLayout = (_ctx: Router.LayoutContext<Router.RouteState>, children: ComponentChildren) => (
  <SiteLayout>{children}</SiteLayout>
);

/** The application route map consumed by the router plugin. */
export const routes = defineRoutes({
  boards: route("/")
    .layout(siteLayout)
    .render(() => <BoardListPage />),
  board: route("/b/{id}")
    .layout(siteLayout)
    .render(ctx => <BoardPage id={ctx.params.id} />)
});

/** Pure, app-free URL builder over the route map (page links). */
export const urls = createUrls(routes, "en");
