/**
 * @file Route map — ONE table for build, SPA nav, and link building (web Rule R2). `/` = TV/stage,
 * `/controller/{code}` = phone. The join URL is built with `urls.toUrl("controller", { code })`.
 */
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { ControllerLayout } from "./layouts/ControllerLayout";
import { StageLayout } from "./layouts/StageLayout";
import { ControllerPage } from "./pages/ControllerPage";
import { StagePage } from "./pages/StagePage";

/** The two addressable surfaces — role is chosen by URL. */
export const routes = defineRoutes({
  tv: route("/")
    .layout(StageLayout)
    .render(() => <StagePage />),
  controller: route("/controller/{code}")
    .layout(ControllerLayout)
    .render(() => <ControllerPage />)
});

/**
 * App-free URL builder over the route map (the only sanctioned internal-link source).
 *
 * @example
 * ```ts
 * urls.toUrl("controller", { code }); // "/controller/4F2KAB12"
 * ```
 */
export const urls = createUrls(routes, "en");
