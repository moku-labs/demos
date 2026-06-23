/**
 * @file Route map — the single source of truth for every addressable place in the app (web Rule R2:
 * ONE route table for build, SPA navigation, and link building). Add a place here and it is instantly
 * buildable, navigable, AND linkable through `urls` — never hardcode an internal URL anywhere else.
 *
 * Sitemap (every entry is a shareable deep link):
 *   signin    /signin                          — the auth gate (sign in)
 *   signup    /signup                          — the auth gate (open an account)
 *   home      /                                — the default board (board view)
 *   board     /board/{id}                      — a single board, kanban view
 *   list      /board/{id}/list                 — the same board, editorial list view
 *   issue     /board/{id}/issue/{issueId}      — a board with one issue open (the article editor)
 *   attachment /board/{id}/issue/{issueId}/attachment/{attachmentId} — an issue with an image preview open
 *   activity  /board/{id}/activity             — a board, focused on the live activity record
 *
 * Auth routes wear the {@link AuthLayout} split; every app route shares the {@link SiteLayout} chrome
 * via `.layout(SiteLayout)`. In SPA mode the chrome persists and only the page `<section>` is swapped
 * on navigation. Deep-link focus + the list/board view toggle are declared as route metadata via
 * `.meta()`; the board/issue/activity islands read it (plus the board/issue ids) straight off their
 * component context — `ctx.meta.focus`, `ctx.meta.view`, `ctx.params.id`, `ctx.params.issueId` — so
 * the pages emit no `data-*` bridge.
 */
import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { AuthLayout } from "./layouts/AuthLayout";
import { SiteLayout } from "./layouts/SiteLayout";
import { AuthPage } from "./pages/AuthPage";
import { BoardPage } from "./pages/BoardPage";

/**
 * The application route map — one entry per addressable place (see the file-header sitemap). The
 * typed `urls` builder picks up every entry automatically, and the moku-web "links via the route map"
 * check keeps callers honest.
 */
export const routes = defineRoutes({
  signin: route("/signin")
    .layout(AuthLayout)
    .render(ctx => (
      <AuthPage
        mode="signin"
        signinHref={ctx.url("signin", {})}
        signupHref={ctx.url("signup", {})}
      />
    )),
  signup: route("/signup")
    .layout(AuthLayout)
    .render(ctx => (
      <AuthPage
        mode="signup"
        signinHref={ctx.url("signin", {})}
        signupHref={ctx.url("signup", {})}
      />
    )),
  home: route("/")
    .layout(SiteLayout)
    .render(() => <BoardPage />),
  board: route("/board/{id}")
    .layout(SiteLayout)
    .render(() => <BoardPage />),
  list: route("/board/{id}/list")
    .layout(SiteLayout)
    .meta({ view: "list" })
    .render(() => <BoardPage />),
  issue: route("/board/{id}/issue/{issueId}")
    .layout(SiteLayout)
    .meta({ focus: "issue" })
    .render(() => <BoardPage />),
  attachment: route("/board/{id}/issue/{issueId}/attachment/{attachmentId}")
    .layout(SiteLayout)
    .meta({ focus: "issue" })
    .render(() => <BoardPage />),
  activity: route("/board/{id}/activity")
    .layout(SiteLayout)
    .meta({ focus: "activity" })
    .render(() => <BoardPage />)
});

/**
 * Pure, app-free URL builder over the route map — the ONLY sanctioned way to build an internal link
 * (islands, components, layouts). Building links here, never from string literals, is what keeps
 * every place deep-linkable as patterns evolve.
 *
 * @example
 * ```ts
 * urls.toUrl("board", { id });                       // "/board/abc"
 * urls.toUrl("issue", { id, issueId });              // "/board/abc/issue/xyz"
 * urls.toUrl("activity", { id });                    // "/board/abc/activity"
 * urls.toUrl("signin", {});                          // "/signin"
 * ```
 */
export const urls = createUrls(routes, "en");
