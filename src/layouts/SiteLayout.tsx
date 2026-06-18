/**
 * @file SiteLayout — persistent chrome (header + main slot) wrapping every page.
 */
import type { ComponentChildren } from "preact";

/** SiteLayout props. */
export interface SiteLayoutProps {
  /** Page content rendered into the main slot. */
  children: ComponentChildren;
}

/**
 * Frames page content in the site header + main region.
 *
 * @param props - The layout props.
 * @param props.children - Page content rendered into the main slot.
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
      </header>
      <main data-main>{children}</main>
    </div>
  );
}
