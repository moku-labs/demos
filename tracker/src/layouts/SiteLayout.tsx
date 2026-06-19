/**
 * @file SiteLayout — persistent chrome wrapping every page. The layout owns `<main> > <section>`
 * (the default swapSelector `"main > section"`); the header sits OUTSIDE it so it survives SPA
 * navigation, while `{children}` (a page's content) is what the router swaps inside the `<section>`.
 */
import type { ComponentChildren } from "preact";

/** SiteLayout props. */
export interface SiteLayoutProps {
  /** Page content rendered into the `main > section` swap region this layout owns. */
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
      <main data-main>
        <section>{children}</section>
      </main>
    </div>
  );
}
