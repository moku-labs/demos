/**
 * @file DepartmentTab — one entry in the numbered departments index (design context §3 hierarchy + §6
 * B2). Reads like a magazine contents line: a two-digit serial ("01", "02"), the department name, an
 * optional customized element icon, the universal "⋯" menu trigger, and a drag handle. The active
 * department carries the vermilion underline (`data-active`). Pure + SSR — the structure renders
 * server-side; the Phase-C departments island wires the menu + drag off the `data-action`/`data-drag`
 * hooks. The icon is resolved from the element's customization (matched upstream), narrowed to a
 * known glyph so an unknown stored value simply renders no icon.
 */

import type { Customization, Department } from "../lib/types";
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

/** Props for {@link DepartmentTab}. */
export interface DepartmentTabProps {
  /** The department this tab represents. */
  department: Department;
  /** Zero-based position in the index; rendered as a two-digit serial ("01", "02", …). */
  index: number;
  /** Whether this is the active department (gets the vermilion underline). */
  active: boolean;
  /** The department's colour/icon customization, when one exists. */
  customization?: Customization;
}

/**
 * Render one numbered department tab — serial, name, optional icon, "⋯" menu, and drag handle.
 *
 * @param props - The department-tab props.
 * @param props.department - The department this tab represents.
 * @param props.index - Zero-based position, rendered as a two-digit serial.
 * @param props.active - Whether this is the active department.
 * @param props.customization - The element's colour/icon customization, when present.
 * @returns The department tab element.
 * @example
 * ```tsx
 * <DepartmentTab department={dept} index={0} active customization={custom} />
 * ```
 */
export function DepartmentTab({ department, index, active, customization }: DepartmentTabProps) {
  const serial = String(index + 1).padStart(2, "0");
  const icon = toElementIcon(customization?.icon);
  return (
    <div
      data-dept-tab
      data-active={active ? "" : undefined}
      data-drag="department"
      aria-current={active ? "true" : undefined}
    >
      <span data-dept-handle aria-hidden="true" />
      <span data-dept-serial aria-hidden="true">
        {serial}
      </span>
      {icon && (
        <span data-dept-icon>
          <Icon name={icon} />
        </span>
      )}
      <span data-dept-name>{department.title}</span>
      <button type="button" data-action="menu" aria-label={`${department.title} menu`}>
        <Icon name="more" />
      </button>
    </div>
  );
}
