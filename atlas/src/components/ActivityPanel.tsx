/**
 * @file ActivityPanel (overlay C1) — *"The Record"*, a right-hand read-only drawer of the durable
 * activity history (design context §6 C1). Entries are grouped by day under sticky day headings and
 * laid out as an editorial **timeline**: a left rail carries a coloured, iconed event badge (created /
 * moved / updated / attached / deleted) joined by a vertical connector, the target reads in
 * italic-serif, and the actor {@link Avatar} plus a mono relative time sit on the meta line. Its own
 * filters narrow by event type and by person. The Record is non-destructive — there is no edit/delete
 * affordance anywhere in it. On phones the drawer goes full-screen. Pure + SSR shared markup: the
 * Phase-C activity island re-renders it with live data via `h(ActivityPanel, props)`; behaviour
 * (open/close, filters) is wired off the `data-action`/`data-scrim` hooks.
 */

import { PEOPLE } from "../lib/people";
import type { Activity, ActivityKind, Person } from "../lib/types";
import { Avatar } from "./Avatar";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

/** The icon glyph each activity verb is shown with. */
const KIND_ICON: Record<ActivityKind, IconName> = {
  created: "plus",
  moved: "activity",
  updated: "feather",
  attached: "attach",
  deleted: "trash"
};

/** Human label for each activity verb (its hue is set in CSS by `data-kind`). */
const KIND_LABEL: Record<ActivityKind, string> = {
  created: "Created",
  moved: "Moved",
  updated: "Updated",
  attached: "Attached",
  deleted: "Deleted"
};

/** The verbs offered in the event-type filter row, in display order. */
const KIND_ORDER: readonly ActivityKind[] = ["created", "moved", "updated", "attached", "deleted"];

/** A day's worth of entries, newest day first. */
interface ActivityGroup {
  /** The editorial day heading (e.g. "Today", "Mar 18"). */
  day: string;
  /** Entries filed on that day. */
  entries: Activity[];
}

/**
 * Group activities into day buckets, preserving incoming order within each bucket.
 *
 * @param activities - The activity entries to group.
 * @returns One {@link ActivityGroup} per distinct day, in first-seen order.
 */
function groupByDay(activities: Activity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  const index = new Map<string, ActivityGroup>();
  for (const entry of activities) {
    const day = dayHeading(entry.at);
    let group = index.get(day);
    if (!group) {
      group = { day, entries: [] };
      index.set(day, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/**
 * Format an entry's timestamp into its editorial day heading (UTC, stable across SSR/CSR).
 *
 * @param at - The entry's epoch-millisecond timestamp.
 * @returns A short day label such as "Mar 18".
 */
function dayHeading(at: number): string {
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

/**
 * Format an entry's timestamp into a short mono clock label (UTC, stable across SSR/CSR).
 *
 * @param at - The entry's epoch-millisecond timestamp.
 * @returns A short time label such as "14:05".
 */
function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
}

/** Props for {@link ActivityPanel}. */
export interface ActivityPanelProps {
  /** The activity entries to display, newest first. */
  activities: Activity[];
  /** The people offered in the "by person" filter row (defaults to the demo cast). */
  people?: readonly Person[];
}

/**
 * Render the read-only activity drawer — header, filter rows, and day-grouped entries.
 *
 * @param props - The activity-panel props.
 * @param props.activities - The activity entries to display, newest first.
 * @param props.people - The people offered in the person filter (defaults to {@link PEOPLE}).
 * @returns The activity drawer element.
 * @example
 * ```tsx
 * <ActivityPanel activities={record} />
 * ```
 */
export function ActivityPanel({ activities, people = PEOPLE }: ActivityPanelProps) {
  const groups = groupByDay(activities);
  return (
    <div data-activity-panel>
      <div data-scrim data-action="close-activity" aria-hidden="true" />
      <aside data-drawer role="dialog" aria-label="The Record">
        <header data-drawer-head>
          <div data-drawer-titles>
            <h2 data-drawer-title>The Record</h2>
            <span data-readonly-badge>read-only</span>
          </div>
          <button type="button" data-action="close-activity" aria-label="Close activity">
            <Icon name="close" />
          </button>
        </header>

        <div data-record-filters>
          <div data-filter-row data-facet="kind">
            <span data-filter-row-label>Type</span>
            <div data-filter-chips>
              {KIND_ORDER.map(kind => (
                <button
                  key={kind}
                  type="button"
                  data-kind-filter={kind}
                  data-action="filter-kind"
                  data-value={kind}
                >
                  <span data-kind-mark data-kind={kind} aria-hidden="true">
                    <Icon name={KIND_ICON[kind]} />
                  </span>
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>
          <div data-filter-row data-facet="person">
            <span data-filter-row-label>Who</span>
            <div data-filter-chips>
              {people.map(person => (
                <button
                  key={person.id}
                  type="button"
                  data-person-filter={person.id}
                  data-action="filter-person"
                  data-value={person.id}
                  aria-label={person.name}
                >
                  <Avatar person={person} size="sm" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div data-record-feed>
          {groups.map(group => (
            <section key={group.day} data-day-group>
              <h3 data-day-heading>
                {group.day}
                <span data-day-count>{group.entries.length}</span>
              </h3>
              <ol data-day-entries>
                {group.entries.map(entry => (
                  <li key={entry.id} data-entry data-kind={entry.kind}>
                    <div data-entry-rail aria-hidden="true">
                      <span data-entry-badge data-kind={entry.kind}>
                        <Icon name={KIND_ICON[entry.kind]} />
                      </span>
                      <span data-entry-connector />
                    </div>
                    <div data-entry-body>
                      <p data-entry-line>
                        <span data-entry-kind data-kind={entry.kind}>
                          {KIND_LABEL[entry.kind]}
                        </span>
                        <span data-entry-target>{entry.summary}</span>
                      </p>
                      <div data-entry-meta>
                        {entry.actorName ? (
                          <Avatar
                            person={{
                              id: entry.actorId ?? "ak",
                              name: entry.actorName,
                              initials: initialsOf(entry.actorName)
                            }}
                            size="sm"
                          />
                        ) : (
                          <span data-entry-system aria-hidden="true">
                            <Icon name="activity" />
                          </span>
                        )}
                        <time data-entry-time dateTime={new Date(entry.at).toISOString()}>
                          {clockLabel(entry.at)}
                        </time>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

/**
 * Derive two-letter initials from a person's display name.
 *
 * @param name - The actor's full name.
 * @returns Up-to-two uppercase initials (e.g. "Anya Kovač" → "AK").
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}
