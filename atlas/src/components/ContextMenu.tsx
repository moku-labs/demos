/**
 * @file ContextMenu (popups D1 + D2) — one component, two variants. `variant="element"` is the
 * universal "⋯" menu shared by every hierarchy element (design context §4 + §6 D1): Rename ·
 * Customize · Delete, plus an optional context "Move to…"; Delete is the vermilion danger item.
 * `variant="user"` is the avatar menu (D2): the signed-in name + email, then "Sign out". Every item
 * carries a `data-action` for the wiring island. A small popover on desktop, a bottom sheet on phones —
 * the sheet leads with a grab handle over a full-bleed scrim (the scrim's `data-action="close"` dismisses).
 * Pure + SSR shared markup: the Phase-C menu island re-renders it via `h(ContextMenu, props)`.
 */

import { Fragment } from "preact";

import type { IconName } from "./Icon";
import { Icon } from "./Icon";

/** One actionable menu item. */
interface MenuItem {
  /** The action token the wiring island dispatches on. */
  action: string;
  /** The item's leading glyph. */
  icon: IconName;
  /** The item's label. */
  label: string;
  /** Whether this is the destructive (vermilion) item. */
  danger?: boolean;
}

/** The signed-in user shown in the `user` variant. */
export interface ContextMenuUser {
  /** Display name. */
  name: string;
  /** Email address. */
  email: string;
}

/** Props for {@link ContextMenu}. */
export interface ContextMenuProps {
  /** Which menu to render — the universal element menu or the user menu. */
  variant: "element" | "user";
  /** The element's display name (element variant), used for accessible item labels. */
  elementLabel?: string;
  /** Whether to include the context "Move to…" item (element variant). */
  canMove?: boolean;
  /** The signed-in user (user variant). */
  user?: ContextMenuUser;
}

/**
 * Build the element menu's item list — Rename · Customize · (Move to…) · Delete.
 *
 * @param canMove - Whether to include the context "Move to…" item.
 * @returns The ordered menu items.
 */
function elementItems(canMove: boolean | undefined): MenuItem[] {
  const items: MenuItem[] = [
    { action: "rename", icon: "feather", label: "Rename" },
    { action: "customize", icon: "gear", label: "Customize" }
  ];
  if (canMove) items.push({ action: "move", icon: "layers", label: "Move to…" });
  items.push({ action: "delete", icon: "trash", label: "Delete", danger: true });
  return items;
}

/**
 * Render the context menu for the given variant.
 *
 * @param props - The context-menu props.
 * @param props.variant - Which menu to render (`element` | `user`).
 * @param props.elementLabel - The element's display name (element variant).
 * @param props.canMove - Whether to include "Move to…" (element variant).
 * @param props.user - The signed-in user (user variant).
 * @returns The context menu element.
 * @example
 * ```tsx
 * <ContextMenu variant="element" elementLabel="Platform" canMove />
 * <ContextMenu variant="user" user={{ name: "Anya Kovač", email: "anya@atlas.dev" }} />
 * ```
 */
export function ContextMenu({ variant, elementLabel, canMove, user }: ContextMenuProps) {
  if (variant === "user") {
    return (
      <Fragment>
        <div data-scrim data-action="close" aria-hidden="true" />
        <div data-context-menu data-variant="user" role="menu" aria-label="Account">
          <span data-sheet-grip aria-hidden="true" />
          <div data-user-card>
            <span data-user-name>{user?.name ?? "Signed in"}</span>
            {user?.email && <span data-user-email>{user.email}</span>}
          </div>
          <div data-menu-rule aria-hidden="true" />
          <button type="button" data-menu-item data-action="profile" role="menuitem">
            <Icon name="feather" />
            Edit profile
          </button>
          <button type="button" data-menu-item data-action="sign-out" role="menuitem">
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </Fragment>
    );
  }

  const items = elementItems(canMove);
  return (
    <Fragment>
      <div data-scrim data-action="close" aria-hidden="true" />
      <div
        data-context-menu
        data-variant="element"
        role="menu"
        aria-label={elementLabel ? `${elementLabel} menu` : "Menu"}
      >
        <span data-sheet-grip aria-hidden="true" />
        {items.map(item => (
          <button
            key={item.action}
            type="button"
            data-menu-item
            data-action={item.action}
            data-danger={item.danger ? "" : undefined}
            role="menuitem"
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>
    </Fragment>
  );
}
