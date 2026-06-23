/**
 * @file BoardPage — the route render for the app routes (board / list / issue / activity). The board
 * working screen (header + board body + issue overlay) is NOT here: it lives in the persistent chrome
 * ({@link file://../layouts/SiteLayout.tsx}) so it is never unmounted by navigation — the board stays
 * mounted, WebSocket-connected, and live across issue open/close (no re-fetch, no flicker, no scroll
 * reset). Those islands read the board id + deep-link focus straight off their route context
 * (`ctx.params.id`, `ctx.params.issueId`, `ctx.meta.focus`, `ctx.meta.view`) via their `onNavEnd` sync.
 *
 * This route render therefore produces NO content of its own — it is only the SPA swap anchor that
 * fires the navigation lifecycle (which re-syncs the persistent islands). Every app route shares this
 * empty render; the visible difference between them is driven entirely by the route's params/meta.
 */
import { Fragment } from "preact";

/**
 * Render the (empty) app-route body. The board working screen is persistent chrome (see file header);
 * this is just the swap anchor.
 *
 * @returns An empty fragment — the route's content lives in the persistent chrome.
 * @example
 * ```tsx
 * route("/board/{id}").layout(SiteLayout).render(() => <BoardPage />);
 * ```
 */
export function BoardPage() {
  return <Fragment />;
}
