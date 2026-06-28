/**
 * @file Route map — ONE table for build, SPA nav, and link building (web Rule R2). `/` = TV/stage,
 * `/code/{code}` = phone, `/code` (no code) = a join-by-code entry box. The join URL is built with
 * `urls.toUrl("controller", { code })` → `/code/{code}`, the same short path printed on the TV and
 * encoded in the lobby QR — easy to read aloud, type, and share.
 */
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { ControllerLayout } from "./layouts/ControllerLayout";
import { StageLayout } from "./layouts/StageLayout";
import { CodeEntryPage } from "./pages/CodeEntryPage";
import { ControllerPage } from "./pages/ControllerPage";
import { StagePage } from "./pages/StagePage";

/** The addressable surfaces — role is chosen by URL. */
export const routes = defineRoutes({
  tv: route("/")
    .layout(StageLayout)
    .render(() => <StagePage />),
  // No-code landing: a phone that opens `/code` (typed/shared without a code) gets a join-by-code box.
  codeEntry: route("/code")
    .layout(ControllerLayout)
    .render(() => <CodeEntryPage />),
  controller: route("/code/{code}")
    .layout(ControllerLayout)
    .render(() => <ControllerPage />)
});

/**
 * App-free URL builder over the route map (the only sanctioned internal-link source).
 *
 * @example
 * ```ts
 * urls.toUrl("controller", { code }); // "/code/4F2KAB12"
 * urls.toUrl("codeEntry", {}); // "/code"
 * ```
 */
export const urls = createUrls(routes, "en");
