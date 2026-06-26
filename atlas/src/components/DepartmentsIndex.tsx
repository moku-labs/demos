/**
 * @file DepartmentsIndex (region B2) — the numbered, horizontally-scrolling top navigation (design
 * context §3 + §6 B2). Reads like a magazine contents page: a {@link DepartmentTab} per department
 * (the active one underlined in vermilion), then an "Add department" affordance. Departments order by
 * `position`; each tab is matched to its element customization by `elementId`. On phones the index
 * scrolls sideways (design context §5). Pure + SSR — the Phase-C departments island wires add/menu/drag.
 */

import type { Customization, Department } from "../lib/types";
import { DepartmentTab } from "./DepartmentTab";
import { Icon } from "./Icon";

/** Props for {@link DepartmentsIndex}. */
export interface DepartmentsIndexProps {
  /** All departments to list (rendered in `position` order). */
  departments: Department[];
  /** Id of the active department (its tab gets the vermilion underline). */
  activeId: string;
  /** Department-level customizations; matched to each tab by `elementId`. */
  customizations: Customization[];
}

/**
 * Render the numbered departments index — a tab per department plus the "Add department" affordance.
 *
 * @param props - The departments-index props.
 * @param props.departments - All departments to list.
 * @param props.activeId - Id of the active department.
 * @param props.customizations - Department-level customizations, matched by `elementId`.
 * @returns The departments index element.
 * @example
 * ```tsx
 * <DepartmentsIndex departments={departments} activeId={dept.id} customizations={customizations} />
 * ```
 */
export function DepartmentsIndex({ departments, activeId, customizations }: DepartmentsIndexProps) {
  const ordered = [...departments].sort((a, b) => a.position - b.position);
  const customByElement = new Map(customizations.map(c => [c.elementId, c]));
  return (
    <nav data-departments aria-label="Departments">
      <div data-departments-track>
        {ordered.map((department, index) => {
          const customization = customByElement.get(department.id);
          return (
            <DepartmentTab
              key={department.id}
              department={department}
              index={index}
              active={department.id === activeId}
              {...(customization ? { customization } : {})}
            />
          );
        })}
        <button type="button" data-add-dept data-action="add-department">
          <Icon name="plus" />
          <span>Add department</span>
        </button>
        {/* The drag-reorder insertion bar is a body-level overlay owned by lib/drag-indicator.ts (never
            a Preact child — reparenting one out of this persistent island crashed Preact's reconcile). */}
      </div>
    </nav>
  );
}
