/**
 * @file SiteLayout — the persistent chrome wrapping every *app* route (board / list / issue /
 * activity), AND the route layout itself: it has the framework layout signature
 * `(ctx, children) => VNode`, so routes use `.layout(SiteLayout)` directly. The flowing document runs
 * masthead → departments index → boards bar → `main > section` (the swapped page) → footer (design
 * context §5). The departments index + boards bar are island mount points (live worker data, Phase C);
 * the global overlay singletons (activity drawer, filter, customize, menu, modal, toast) live here so
 * they persist across SPA navigation. The home link is built from the route map via `ctx.url` — never
 * a hardcoded URL.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";
import { Footer } from "../components/Footer";
import { Masthead } from "../components/Masthead";

/** The magazine edition line carried in the masthead (design context §2 "Masthead flavour"). */
const EDITION = "Vol. 4 · No. 12 · Spring Cycle — Mar 2026";

/**
 * Frame an app page in the persistent editorial chrome + the swappable main region.
 *
 * @param ctx - The route layout context; its `url` builds links from the route map.
 * @param children - Page content rendered into the `main > section` swap region.
 * @returns The framed layout.
 * @example
 * ```tsx
 * route("/board/{id}").layout(SiteLayout).render(() => <BoardPage />);
 * ```
 */
export function SiteLayout(
  ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return (
    <div data-app-shell>
      <Masthead homeHref={ctx.url("home", {})} edition={EDITION} />

      <nav data-island="departments" data-region="departments-index" aria-label="Departments" />
      <div data-island="boards-bar" data-region="boards-bar" />

      <main data-main>
        <section>{children}</section>
      </main>

      <Footer />

      {/* Global overlay singletons — empty until a Phase-C island opens them (design context §6 C/D/E/F). */}
      <aside data-island="activity-panel" data-overlay="activity" hidden />
      <div data-island="filter-panel" data-overlay="filter" hidden />
      <div data-island="customize-panel" data-overlay="customize" hidden />
      <div data-island="context-menu" data-overlay="menu" hidden />
      <div data-island="modal" data-overlay="modal" hidden />
      <div data-island="toast" data-overlay="toast" aria-live="polite" />
    </div>
  );
}
