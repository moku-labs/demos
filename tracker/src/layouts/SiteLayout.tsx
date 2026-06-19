/**
 * @file SiteLayout — persistent chrome wrapping every page. The header sits OUTSIDE `main > section`
 * so it survives SPA navigation; `{children}` (a page's `<section>`) IS the swap region the router
 * replaces on navigation (default swapSelector `"main > section"`).
 */
import type { ComponentChildren } from "preact";

/** SiteLayout props. */
export interface SiteLayoutProps {
  /** Page content rendered into the swap region (a page's `<section>`). */
  children: ComponentChildren;
}

/**
 * Frame page content in the persistent site header + the swappable main region.
 *
 * @param props - The layout props.
 * @param props.children - Page content rendered into the swap region.
 * @returns The framed layout.
 * @example
 * ```tsx
 * <SiteLayout>
 *   <BoardListPage />
 * </SiteLayout>
 * ```
 */
export function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <div data-component="site-layout">
      <header data-site-header>
        <a data-brand href="/">
          Tracker
        </a>
        <p data-tagline>Real-time kanban, proving @moku-labs/worker</p>
      </header>
      <main data-main>{children}</main>
    </div>
  );
}
