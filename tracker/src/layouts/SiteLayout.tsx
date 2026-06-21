/**
 * @file SiteLayout — the persistent chrome wrapping every page, AND the route layout itself: it has
 * the framework layout signature `(ctx, children) => VNode`, so routes use `.layout(SiteLayout)`
 * directly (no wrapper adapter). The layout owns `<main> > <section>` (the default swapSelector
 * `"main > section"`); the header sits OUTSIDE it so it survives SPA navigation, while `children`
 * (a page's content) is what the router swaps inside the `<section>`. The brand link is built from
 * the route map via `ctx.url` — no hardcoded URL.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";

/**
 * Frame page content in the persistent site header + the swappable main region.
 *
 * @param ctx - The route layout context; its `url` builds links from the route map.
 * @param children - Page content rendered into the `main > section` swap region.
 * @returns The framed layout.
 * @example
 * ```tsx
 * route("/").layout(SiteLayout).render(() => <BoardListPage />);
 * ```
 */
export function SiteLayout(
  ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return (
    <div data-island="site-layout">
      <header data-site-header>
        <a data-brand href={ctx.url("boards", {})}>
          Tracker
        </a>
        <p data-tagline>Real-time kanban, proving @moku-labs/worker</p>
      </header>
      <main data-main>
        <section>{children}</section>
      </main>
    </div>
  );
}
