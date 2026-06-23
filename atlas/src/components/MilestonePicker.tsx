/**
 * @file MilestonePicker — the issue rail's milestone catalog popover (design context §7). A quiet
 * bordered card listing the board's remembered milestones: pick one to assign it to the issue, rename
 * one (double-click its name) or delete one (the trailing ×), a "No milestone" clear row, and an add
 * field that creates a new milestone on Enter. Pure + SSR shared markup — the `milestone-picker` island
 * fetches the catalog, re-renders this, and wires every action off the `data-*` hooks. Mirrors the
 * Chooser's popover/sheet shell (a phones bottom sheet with a grab handle + dimming scrim).
 */
import { Icon } from "./Icon";

/** Props for {@link MilestonePicker}. */
export interface MilestonePickerProps {
  /** The board's milestone catalog (distinct names), in display order. */
  milestones: string[];
  /** The issue's current milestone (marks the selected row), or `null`. */
  current?: string | null;
}

/**
 * Render the milestone picker popover — the catalog rows (pick / rename / delete), a "No milestone"
 * clear row, and the add-new field.
 *
 * @param props - The milestone-picker props.
 * @param props.milestones - The board's milestone catalog.
 * @param props.current - The issue's current milestone (marks the selected row).
 * @returns The milestone-picker element.
 * @example
 * ```tsx
 * <MilestonePicker milestones={["Sprint 11", "Sprint 12"]} current="Sprint 12" />
 * ```
 */
export function MilestonePicker({ milestones, current = null }: MilestonePickerProps) {
  return (
    <div data-milestone-picker>
      <div data-scrim data-action="dismiss-milestone" aria-hidden="true" />
      <div data-ms-card role="dialog" aria-label="Milestone">
        <span data-sheet-grip aria-hidden="true" />
        <span data-ms-title>Milestone</span>

        <div data-ms-list>
          <button
            type="button"
            data-ms-option
            data-action="pick-milestone"
            data-value=""
            data-selected={current ? undefined : ""}
          >
            <span data-ms-mark aria-hidden="true" />
            <span data-ms-name>No milestone</span>
          </button>

          {milestones.map(name => (
            <div key={name} data-ms-row>
              <button
                type="button"
                data-ms-option
                data-action="pick-milestone"
                data-value={name}
                data-selected={current === name ? "" : undefined}
                title="Assign to this issue"
              >
                <span data-ms-mark aria-hidden="true">
                  <Icon name="flag" />
                </span>
                <span data-ms-name>{name}</span>
                {current === name && (
                  <span data-ms-check aria-hidden="true">
                    <Icon name="check" />
                  </span>
                )}
              </button>
              <button
                type="button"
                data-ms-act
                data-action="rename-milestone"
                data-value={name}
                aria-label={`Rename milestone ${name}`}
                title="Rename milestone"
              >
                <Icon name="feather" />
              </button>
              <button
                type="button"
                data-ms-act
                data-action="delete-milestone"
                data-value={name}
                aria-label={`Delete milestone ${name}`}
                title="Delete milestone"
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>

        <div data-ms-add>
          <span data-ms-add-box aria-hidden="true">
            <Icon name="plus" />
          </span>
          <input
            type="text"
            data-ms-add-field
            placeholder="New milestone…"
            aria-label="New milestone"
            autocomplete="off"
          />
        </div>
      </div>
    </div>
  );
}
