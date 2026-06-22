/**
 * @file BoardsBar (region B3) — the active department's boards as pills, an "Add board" affordance,
 * then the right-hand controls cluster (design context §6 B3). Controls are: a Board / List segmented
 * toggle (two real route links, the current `view` marked active — mirroring AuthForm's
 * `[data-auth-switch]`), and Filter + Activity buttons. Boards order by `position`; each pill matches
 * its element customization by `elementId`. On phones the pills scroll sideways (design context §5).
 * Pure + SSR — the toggle navigates with no JS; the Phase-C islands wire add/menu/drag + the Filter /
 * Activity overlays off the `data-action` hooks.
 */

import type { Board, Customization } from "../lib/types";
import { urls } from "../routes";
import { BoardPill } from "./BoardPill";
import { DropIndicator } from "./DropIndicator";
import { Icon } from "./Icon";

/** Props for {@link BoardsBar}. */
export interface BoardsBarProps {
  /** The active department's boards (rendered in `position` order). */
  boards: Board[];
  /** Id of the active board (its pill gets the accent tint; drives the toggle links). */
  activeBoardId: string;
  /** Which view is showing — marks the matching segment of the Board / List toggle. */
  view: "board" | "list";
  /** Board-level customizations; matched to each pill by `elementId`. */
  customizations?: Customization[];
  /**
   * Whether an empty department is selected — when true the controls cluster (Board / List · Filter ·
   * Activity) is hidden, leaving only "Add board", since there is no board to view, filter, or toggle.
   */
  emptyDepartment?: boolean;
}

/**
 * Render the boards bar — board pills, "Add board", and (unless an empty department is selected) the
 * Board/List · Filter · Activity controls.
 *
 * @param props - The boards-bar props.
 * @param props.boards - The active department's boards.
 * @param props.activeBoardId - Id of the active board.
 * @param props.view - Which view is showing (`board` | `list`).
 * @param props.customizations - Board-level customizations, matched by `elementId`.
 * @param props.emptyDepartment - When true, hide the controls (only "Add board" shows).
 * @returns The boards bar element.
 * @example
 * ```tsx
 * <BoardsBar boards={boards} activeBoardId={board.id} view="board" customizations={customizations} />
 * ```
 */
export function BoardsBar({
  boards,
  activeBoardId,
  view,
  customizations = [],
  emptyDepartment = false
}: BoardsBarProps) {
  const ordered = [...boards].sort((a, b) => a.position - b.position);
  const customByElement = new Map(customizations.map(c => [c.elementId, c]));
  return (
    <div data-boards-bar>
      <div data-boards-track>
        {ordered.map(board => {
          const customization = customByElement.get(board.id);
          return (
            <BoardPill
              key={board.id}
              board={board}
              active={board.id === activeBoardId}
              {...(customization ? { customization } : {})}
            />
          );
        })}
        <button type="button" data-add-board data-action="add-board">
          <Icon name="plus" />
          <span>Add board</span>
        </button>
        {/* Drag-reorder insertion bar — hidden until the boards-bar island moves it under the pointer. */}
        <DropIndicator orientation="vertical" hidden />
      </div>

      {emptyDepartment ? undefined : (
        <div data-boards-controls>
          <nav data-view-switch aria-label="Board or list view">
            <a
              href={urls.toUrl("board", { id: activeBoardId })}
              data-seg
              data-active={view === "board" ? "" : undefined}
              aria-current={view === "board" ? "page" : undefined}
            >
              Board
            </a>
            <a
              href={urls.toUrl("list", { id: activeBoardId })}
              data-seg
              data-active={view === "list" ? "" : undefined}
              aria-current={view === "list" ? "page" : undefined}
            >
              List
            </a>
          </nav>

          <button type="button" data-control="filter" data-action="open-filter" aria-label="Filter">
            <Icon name="filter" />
            <span data-control-text>Filter</span>
          </button>
          <button
            type="button"
            data-control="activity"
            data-action="open-activity"
            aria-label="Activity"
          >
            <Icon name="activity" />
            <span data-control-text>Activity</span>
          </button>
        </div>
      )}
    </div>
  );
}
