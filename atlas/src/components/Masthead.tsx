/**
 * @file Masthead (region B1) — the wordmark **Atlas.** with its vermilion full-stop, the mono edition
 * line, and the header tools (theme toggle · Filter · Activity · user avatar). The tools carry
 * `data-action` hooks + island mount points; the Phase-C islands (`theme-toggle`, header `menu`)
 * wire the behaviour. On phones the tools collapse behind a single "⋯" overflow that opens the
 * `overflow-sheet` island's bottom sheet — theme · Filter · Activity · Board/List view (design context
 * §6 D3). Pure + SSR — the static structure renders server-side and persists across SPA navigation.
 */
import { Icon } from "./Icon";

/** Props for {@link Masthead}. */
export interface MastheadProps {
  /** Home href, built from the route map by the layout (`ctx.url("home", {})`). */
  homeHref: string;
  /** The edition line (e.g. "Vol. 4 · No. 12 · Spring Cycle — Mar 2026"). */
  edition: string;
}

/**
 * Render the masthead — wordmark, edition line, and the header tool rail.
 *
 * @param props - The masthead props.
 * @param props.homeHref - Home href built from the route map.
 * @param props.edition - The edition line text.
 * @returns The masthead element.
 * @example
 * ```tsx
 * <Masthead homeHref={ctx.url("home", {})} edition="Vol. 4 · No. 12 — Mar 2026" />
 * ```
 */
export function Masthead({ homeHref, edition }: MastheadProps) {
  return (
    <header data-masthead>
      <div data-mast-brand>
        <a data-wordmark href={homeHref}>
          Atlas<span data-stop>.</span>
        </a>
        <p data-edition>{edition}</p>
      </div>

      <nav data-tools aria-label="Tools">
        <button
          type="button"
          data-island="theme-toggle"
          data-tool="theme"
          aria-label="Toggle theme"
        >
          <span data-theme-sun>
            <Icon name="sun" />
          </span>
          <span data-theme-moon>
            <Icon name="moon" />
          </span>
        </button>
        <button type="button" data-tool="filter" data-action="open-filter" aria-label="Filter">
          <Icon name="filter" />
          <span data-tool-text>Filter</span>
        </button>
        <button
          type="button"
          data-tool="activity"
          data-action="open-activity"
          aria-label="Activity"
        >
          <Icon name="activity" />
          <span data-tool-text>Activity</span>
        </button>
        <button type="button" data-island="user-menu" data-tool="user" aria-label="Account" />
        <button
          type="button"
          data-tool="overflow"
          data-action="open-overflow"
          aria-label="More tools"
        >
          <Icon name="more" />
        </button>
      </nav>

      {/*
        D3 — the mobile overflow bottom sheet. Hidden until the "⋯" opens it (the `overflow-sheet`
        island toggles `hidden`); on desktop the open button is `display:none`, so the sheet is
        phones-only. The scrim dims the page and dismisses on tap; the action rows reuse the existing
        `open-filter` / `open-activity` document hooks (so the filter / activity islands open through
        their own listeners) and a theme toggle that flips the document theme — the reachable home for
        dark mode on phones. Board / List navigate via the island (`data-sheet-view` + `data-view`).
      */}
      <div data-island="overflow-sheet" data-overlay="overflow" hidden>
        <button type="button" data-scrim data-action="close-overflow" aria-label="Close" />
        <div data-overflow-sheet>
          <span data-sheet-grip aria-hidden="true" />

          <button type="button" data-sheet-theme aria-label="Toggle theme">
            <span data-theme-sun>
              <Icon name="sun" />
            </span>
            <span data-theme-moon>
              <Icon name="moon" />
            </span>
            <span data-sheet-label>Theme</span>
          </button>

          <button type="button" data-action="open-filter">
            <Icon name="filter" />
            <span data-sheet-label>Filter</span>
          </button>
          <button type="button" data-action="open-activity">
            <Icon name="activity" />
            <span data-sheet-label>Activity</span>
          </button>

          <div data-sheet-views>
            <button type="button" data-sheet-view data-view="board" aria-label="Board view">
              Board
            </button>
            <button type="button" data-sheet-view data-view="list" aria-label="List view">
              List
            </button>
          </div>

          <button type="button" data-sheet-done data-action="close-overflow">
            Done
          </button>
        </div>
      </div>
    </header>
  );
}
