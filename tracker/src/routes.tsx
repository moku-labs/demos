/**
 * @file Route map — the single source of truth for every addressable place in the app (web Rule R2:
 * ONE route table for build, SPA navigation, and link building). Add a place here and it is instantly
 * buildable, navigable, AND linkable through `urls` — never hardcode an internal URL anywhere else.
 *
 * Sitemap (every entry is a shareable deep link):
 *   boards    /                           — the board list (home)
 *   board     /board/{id}                 — a single board
 *   card      /board/{id}/card/{cardId}   — a board, scrolled to + highlighting one card
 *   activity  /board/{id}/activity        — a board, focused on its live worker-activity feed
 *
 * Every route shares the SiteLayout chrome via `.layout(SiteLayout)`; in SPA mode the chrome persists
 * and only the page `<section>` is swapped on navigation. To add a place, add one entry below — the
 * typed `urls` builder picks it up automatically, and the moku-web "links via the route map" check
 * keeps callers honest.
 */

import { createUrls, defineRoutes, route } from "@moku-labs/web/browser";
import { SiteLayout } from "./layouts/SiteLayout";
import { BoardListPage } from "./pages/BoardListPage";
import { BoardPage } from "./pages/BoardPage";

/**
 * The application route map — one entry per addressable place (see the file-header sitemap). Deep-link
 * focus is declared as route metadata via `.meta({ focus })`: the `board`/`activity-panel` islands read
 * it (plus the board/card ids) straight off their component context — `ctx.meta.focus`, `ctx.params.id`,
 * `ctx.params.cardId` — so the page emits no `data-*` focus bridge (see islands/board.ts).
 */
export const routes = defineRoutes({
  boards: route("/")
    .layout(SiteLayout)
    .render(() => <BoardListPage />),
  board: route("/board/{id}")
    .layout(SiteLayout)
    .render(() => <BoardPage />),
  card: route("/board/{id}/card/{cardId}")
    .layout(SiteLayout)
    .meta({ focus: "card" })
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
 * urls.toUrl("board", { id });                  // "/board/abc"
 * urls.toUrl("card", { id, cardId });           // "/board/abc/card/xyz"
 * urls.toUrl("activity", { id });               // "/board/abc/activity"
 * ```
 */
export const urls = createUrls(routes, "en");
