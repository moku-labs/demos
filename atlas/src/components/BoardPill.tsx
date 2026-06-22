/**
 * @file BoardPill — one board pill in the boards bar (design context §6 B3). A rounded link to the
 * board's kanban (`urls.toUrl("board", { id })`) carrying the board title, an optional customized
 * element icon, the universal "⋯" menu trigger, and a drag handle. The active board is accent-tinted
 * (`data-active`). Pure + SSR — the markup is a real link that degrades without JS; the Phase-C boards
 * island wires the menu + drag off the `data-action`/`data-drag` hooks. The icon is narrowed to a
 * known glyph so an unknown stored value renders nothing.
 */

import type { Board, Customization } from "../lib/types";
import { urls } from "../routes";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

/** The glyph names the customize palette can store (the curated element set, design context §4). */
const ELEMENT_ICONS = new Set<IconName>([
  "rocket",
  "bug",
  "target",
  "flag",
  "bolt",
  "layers",
  "cube",
  "beaker",
  "shield",
  "gear",
  "chart",
  "calendar",
  "database",
  "terminal",
  "compass",
  "feather"
]);

/**
 * Narrow a stored customization icon string to a known {@link IconName}, or `null` when absent/unknown.
 *
 * @param icon - The raw `customization.icon` value (any string, possibly stale).
 * @returns A valid icon name, or `null` to render no icon.
 */
function toElementIcon(icon: string | null | undefined): IconName | null {
  return icon && ELEMENT_ICONS.has(icon as IconName) ? (icon as IconName) : null;
}

/** Props for {@link BoardPill}. */
export interface BoardPillProps {
  /** The board this pill links to (only id + title are read). */
  board: Pick<Board, "id" | "title">;
  /** Whether this is the active board (gets the accent tint). */
  active: boolean;
  /** The board's colour/icon customization, when one exists. */
  customization?: Customization;
}

/**
 * Render one board pill — a link to the board's kanban with optional icon, "⋯" menu, and drag handle.
 *
 * @param props - The board-pill props.
 * @param props.board - The board this pill links to.
 * @param props.active - Whether this is the active board.
 * @param props.customization - The element's colour/icon customization, when present.
 * @returns The board pill element.
 * @example
 * ```tsx
 * <BoardPill board={board} active customization={custom} />
 * ```
 */
export function BoardPill({ board, active, customization }: BoardPillProps) {
  const icon = toElementIcon(customization?.icon);
  return (
    <div data-board-pill data-active={active ? "" : undefined} data-drag="board">
      <span data-board-handle aria-hidden="true" draggable={true} />
      <a
        href={urls.toUrl("board", { id: board.id })}
        data-board-link
        aria-current={active ? "page" : undefined}
      >
        {icon && (
          <span data-board-icon>
            <Icon name={icon} />
          </span>
        )}
        <span data-board-title>{board.title}</span>
      </a>
      <button type="button" data-action="menu" aria-label={`${board.title} menu`}>
        <Icon name="more" />
      </button>
    </div>
  );
}
