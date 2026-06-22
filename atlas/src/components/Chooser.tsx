/**
 * @file Chooser (popup D3) — the generic single/multi select dropdown the issue properties rail opens
 * for its list-valued fields (Status · Priority · Labels · Assignees · Reporter). One quiet bordered
 * card of full-width option rows that warm to sunken paper on hover; the selected row(s) carry a
 * trailing check. Each row leads with the same mark the field renders elsewhere — a status dot, the
 * ascending priority bars, a label dot, or a person's avatar — so the dropdown reads as the field's
 * own vocabulary. Multi-select rows toggle in place and the card closes via its "Done" action; a small
 * popover on desktop, a bottom sheet on phones (the scrim's `data-action="close"` dismisses). Pure +
 * SSR shared markup: the chooser island re-renders it via `h(Chooser, props)` (design context §6 D3).
 */

import type { VNode } from "preact";
import { Fragment } from "preact";
import type { ChooserOption, ChooserOrnament } from "../lib/menu";
import { personById } from "../lib/people";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { LabelDot } from "./LabelDot";
import { PriorityMark } from "./PriorityMark";

/**
 * Render an option's leading mark in the field's own vocabulary, or nothing for `none` / a missing
 * person.
 *
 * @param ornament - The leading-mark descriptor carried by the option.
 * @returns The mark element, or `null` when the option has no mark.
 * @example
 * ```tsx
 * renderOrnament({ kind: "label", label: "bug" });
 * ```
 */
function renderOrnament(ornament: ChooserOrnament): VNode | null {
  switch (ornament.kind) {
    case "status": {
      return <span data-chooser-status data-status={ornament.status} aria-hidden="true" />;
    }
    case "priority": {
      return <PriorityMark priority={ornament.priority} />;
    }
    case "label": {
      return <LabelDot label={ornament.label} text={false} />;
    }
    case "person": {
      const person = personById(ornament.personId);
      return person ? <Avatar person={person} size="sm" /> : null;
    }
    default: {
      return null;
    }
  }
}

/** Props for {@link Chooser}. */
export interface ChooserProps {
  /** The popover heading (the field name). */
  title: string;
  /** The selectable options, in display order. */
  options: ChooserOption[];
  /** Whether several options may be selected (renders the "Done" action). */
  multi?: boolean;
}

/**
 * Render the chooser popover for a rail field — a heading over a list of option rows, each with its
 * leading mark and a trailing check when selected, plus a "Done" action in multi-select mode.
 *
 * @param props - The chooser props.
 * @param props.title - The popover heading (the field name).
 * @param props.options - The selectable options, in display order.
 * @param props.multi - Whether several options may be selected.
 * @returns The chooser element.
 * @example
 * ```tsx
 * <Chooser title="Status" options={statusOptions} />
 * <Chooser title="Labels" options={labelOptions} multi />
 * ```
 */
export function Chooser({ title, options, multi }: ChooserProps) {
  return (
    <Fragment>
      <div data-scrim data-action="close" aria-hidden="true" />
      <div
        data-chooser
        role="listbox"
        aria-label={title}
        aria-multiselectable={multi ? "true" : undefined}
      >
        <span data-sheet-grip aria-hidden="true" />
        <span data-chooser-title>{title}</span>
        <div data-chooser-list>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              data-chooser-option
              data-value={option.value}
              data-selected={option.selected ? "" : undefined}
              role="option"
              aria-selected={option.selected ? "true" : "false"}
            >
              <span data-chooser-mark>{renderOrnament(option.ornament ?? { kind: "none" })}</span>
              <span data-chooser-label>{option.label}</span>
              <span data-chooser-check aria-hidden="true">
                <Icon name="check" />
              </span>
            </button>
          ))}
        </div>
        {multi && (
          <button type="button" data-chooser-done data-action="done">
            Done
          </button>
        )}
      </div>
    </Fragment>
  );
}
