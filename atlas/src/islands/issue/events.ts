/**
 * @file issue island — the declarative delegated event map (selector → handler): one delegated
 * listener per event type on the host. The handler bodies live in handlers.ts. A single
 * `click [data-action]` dispatcher covers the header (× / ⋯ / scrim), the description Preview/Edit
 * toggle, "Attach file", the rail's "Customize", "+ Add property", and each sub-issue's ⋯ (told apart
 * inside the dispatcher).
 */
import type { Spa } from "@moku-labs/web/browser";
import { onAction, onAttachmentClick, onRailEdit, onSubAdd, onSubToggle } from "./handlers";
import type { IssueState } from "./types";

/** The issue island's declarative delegated event map (one delegated listener per type on the host). */
export const issueEvents: Spa.IslandEvents<IssueState> = {
  // Header / scrim / attach / customize / add-property / sub-issue ⋯ — one [data-action] dispatcher.
  "click [data-action]": onAction,
  // An attachment chip: plain click opens the blob, Alt-click deletes it.
  "click [data-attachment]": onAttachmentClick,
  // A quiet rail field click opens its property editor (status/priority/labels/…/milestone).
  "click [data-rail-field]": onRailEdit,
  // The "Add a sub-issue…" field commits on Enter.
  "keydown [data-sub-add-field]": onSubAdd,
  // A sub-issue checkbox toggles its done state.
  "change [data-check] input": onSubToggle
};
