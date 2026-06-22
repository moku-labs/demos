/**
 * @file issue island — how the USER drives the panel: the delegated interaction handler bodies wired
 * to selectors by events.ts. Grouped by feature — the article (title, description, attachments,
 * sub-issues), the properties rail (status / priority / labels / assignees / due / estimate / reporter
 * / milestone / customize), and the header (close, the universal "⋯" menu). Every mutation round-trips
 * through `lib/api`; the returning realtime patch reconciles state (see lifecycle.ts), and a gentle
 * toast confirms the action. The component owns all markup — handlers only read its `data-*` hooks.
 */
import {
  addAttachment,
  addSubIssue,
  deleteAttachment,
  deleteIssue,
  patchIssue,
  removeSubIssue,
  toggleSubIssue
} from "../../lib/api";
import { LABEL_KEYS, LABELS, PRIORITIES, STATUS_ORDER, STATUS_TITLES } from "../../lib/labels";
import { openCustomize, openMenu, openModal, showToast } from "../../lib/menu";
import { PEOPLE, personById } from "../../lib/people";
import type { IssueStatus, LabelKey, Priority } from "../../lib/types";
import { closeToBoard } from "./lifecycle";
import type { IssueContext } from "./types";

/** MIME type used when a selected file reports none. */
const FALLBACK_TYPE = "application/octet-stream";

/** Milliseconds in a day — used to render `dueAt` as a date-input value and back. */
const DAY_MS = 86_400_000;

// ─── article: title ──────────────────────────────────────────────────────────

/**
 * Rename the issue via the prompt modal (the article title's double-click path — the component ships
 * no inline field, so the universal prompt modal is the faster-path Rename).
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the rename persists (or is cancelled).
 * @example
 * ```ts
 * await editTitle(ctx);
 * ```
 */
async function editTitle(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "prompt",
    title: "Rename issue",
    placeholder: "Issue title",
    initialValue: detail.issue.title
  });
  if (result.kind !== "submit") return;

  const title = result.value.trim();
  if (!title || title === detail.issue.title) return;

  await patchIssue(detail.issue.id, { title });
  showToast("Issue renamed");
}

/**
 * Handle a double-click on the article title — open the rename prompt.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * events: { "dblclick [data-issue-title]": onTitleEdit };
 * ```
 */
export function onTitleEdit(ctx: IssueContext): void {
  void editTitle(ctx);
}

// ─── article: description ────────────────────────────────────────────────────

/**
 * Edit the markdown description via the prompt modal pre-filled with the raw source — the Preview/Edit
 * affordance. The panel renders markdown by default; double-clicking the body opens the writer.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the description persists (or is cancelled).
 * @example
 * ```ts
 * await editDescription(ctx);
 * ```
 */
async function editDescription(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  ctx.set({ editingDescription: true });
  const result = await openModal({
    variant: "prompt",
    title: "Edit description",
    placeholder: "Write in Markdown…",
    initialValue: detail.issue.description
  });
  ctx.set({ editingDescription: false });
  if (result.kind !== "submit") return;

  if (result.value === detail.issue.description) return;
  await patchIssue(detail.issue.id, { description: result.value });
  showToast("Description updated");
}

/**
 * Handle a double-click on the rendered description — open the markdown writer.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * events: { "dblclick [data-issue-body]": onDescriptionEdit };
 * ```
 */
export function onDescriptionEdit(ctx: IssueContext): void {
  void editDescription(ctx);
}

// ─── article: attachments ────────────────────────────────────────────────────

/**
 * Open a transient file picker and upload the chosen file to the open issue. The component ships only
 * the "Attach file" button (no `<input type=file>`), so a detached input is created on demand — the
 * same programmatic-element pattern `lib/nav` uses for navigation.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * pickAndUpload(ctx);
 * ```
 */
function pickAndUpload(ctx: IssueContext): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const input = document.createElement("input");
  input.type = "file";

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void uploadFile(ctx, file);
  });
  input.click();
}

/**
 * Upload one file as an attachment on the open issue (the returning patch adds it to the grid).
 *
 * @param ctx - The issue component context.
 * @param file - The selected file.
 * @returns A promise that resolves once the upload persists.
 * @example
 * ```ts
 * await uploadFile(ctx, file);
 * ```
 */
async function uploadFile(ctx: IssueContext, file: File): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  // `addAttachment` reads `file.type`; default an empty type so the worker still stores it.
  const safeFile = file.type ? file : new File([file], file.name, { type: FALLBACK_TYPE });
  await addAttachment(detail.issue.id, safeFile);
  showToast("File attached");
}

/**
 * Handle a click on an attachment chip: a plain click opens/previews the blob in a new tab (via its
 * `/api/attachments` href, without the SPA router intercepting); an Alt-modified click confirms and
 * deletes it (the chip ships no dedicated delete hook, so Alt-click is the power gesture).
 *
 * @param ctx - The issue component context.
 * @param event - The delegated click event.
 * @param link - The matched `[data-attachment]` anchor.
 * @returns A promise (meaningful only on the delete path) that resolves once the action completes.
 * @example
 * ```ts
 * events: { "click [data-attachment]": onAttachmentClick };
 * ```
 */
export async function onAttachmentClick(
  ctx: IssueContext,
  event: Event,
  link: Element
): Promise<void> {
  event.preventDefault();

  // Plain click → open the blob in a new tab.
  const altClick = event instanceof MouseEvent && event.altKey;
  if (!altClick) {
    const href = (link as HTMLAnchorElement).href;
    if (href) globalThis.open(href, "_blank", "noopener");
    return;
  }

  // Alt-click → confirm + delete the attachment.
  const detail = ctx.state.detail;
  const path = (link as HTMLAnchorElement).getAttribute("href") ?? "";
  const attachmentId = path.split("/").pop();
  if (!detail || !attachmentId) return;

  const result = await openModal({
    variant: "delete",
    title: "Delete this attachment?",
    message: "This can't be undone.",
    confirmLabel: "Delete"
  });
  if (result.kind !== "confirm") return;

  await deleteAttachment(attachmentId);
  showToast("Attachment deleted", "danger");
}

// ─── article: sub-issues ─────────────────────────────────────────────────────

/**
 * Handle the add-sub-issue field's Enter key: create the sub-issue and clear the field.
 *
 * @param ctx - The issue component context.
 * @param event - The delegated keydown event.
 * @param field - The matched `[data-sub-add-field]` input.
 * @returns A promise that resolves once the sub-issue persists.
 * @example
 * ```ts
 * events: { "keydown [data-sub-add-field]": onSubAdd };
 * ```
 */
export async function onSubAdd(ctx: IssueContext, event: Event, field: Element): Promise<void> {
  if (!(event instanceof KeyboardEvent) || event.key !== "Enter") return;
  const detail = ctx.state.detail;
  const input = field as HTMLInputElement;
  const title = input.value.trim();
  if (!detail || !title) return;

  event.preventDefault();
  input.value = "";
  await addSubIssue(detail.issue.id, { title });
}

/**
 * Handle a sub-issue checkbox change: toggle its done state.
 *
 * @param ctx - The issue component context.
 * @param _event - The delegated change event (unused).
 * @param box - The matched checkbox input.
 * @returns A promise that resolves once the toggle persists.
 * @example
 * ```ts
 * events: { "change [data-check] input": onSubToggle };
 * ```
 */
export async function onSubToggle(ctx: IssueContext, _event: Event, box: Element): Promise<void> {
  const detail = ctx.state.detail;
  const row = box.closest<HTMLElement>("[data-sub-issue]");
  const subId = row?.querySelector<HTMLElement>("[data-sub-id]")?.dataset.subId;
  if (!detail || !subId) return;

  await toggleSubIssue(detail.issue.id, subId, (box as HTMLInputElement).checked);
}

// ─── properties rail: scalar edits ───────────────────────────────────────────

/**
 * Cycle the issue status to the next one in board order (Backlog → In Progress → In Review → Done →
 * Backlog) — the quiet rail Status field advances on click.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the status change persists.
 * @example
 * ```ts
 * await cycleStatus(ctx);
 * ```
 */
async function cycleStatus(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = STATUS_ORDER.indexOf(detail.issue.status);
  const next = STATUS_ORDER[(current + 1) % STATUS_ORDER.length] as IssueStatus;
  await patchIssue(detail.issue.id, { status: next });
  showToast(`Status → ${STATUS_TITLES[next]}`);
}

/**
 * Cycle the issue priority (none → Low → Medium → High → Urgent → none) — the rail Priority field.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the priority change persists.
 * @example
 * ```ts
 * await cyclePriority(ctx);
 * ```
 */
async function cyclePriority(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const order: Priority[] = ["none", "low", "medium", "high", "urgent"];
  const current = order.indexOf(detail.issue.priority ?? "none");
  const next = order[(current + 1) % order.length] as Priority;
  await patchIssue(detail.issue.id, { priority: next });
  showToast(next === "none" ? "Priority cleared" : `Priority → ${PRIORITIES[next]}`);
}

/**
 * Edit the issue's labels via a comma-separated prompt against the label taxonomy. Unknown keys are
 * dropped; an empty value clears all labels.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the label set persists.
 * @example
 * ```ts
 * await editLabels(ctx);
 * ```
 */
async function editLabels(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = detail.labels.map(({ label }) => label).join(", ");
  const result = await openModal({
    variant: "prompt",
    title: "Labels",
    message: `Comma-separated from: ${LABEL_KEYS.map(key => LABELS[key]).join(", ")}`,
    placeholder: "bug, feature",
    initialValue: current
  });
  if (result.kind !== "submit") return;

  const labels = parseLabels(result.value);
  await patchIssue(detail.issue.id, { labels });
  showToast("Labels updated");
}

/**
 * Parse a comma-separated label prompt into the known {@link LabelKey} set (case-insensitive on key or
 * display name; unknown tokens and duplicates are dropped).
 *
 * @param value - The raw comma-separated prompt value.
 * @returns The recognized, de-duplicated label keys.
 * @example
 * ```ts
 * parseLabels("Bug, feature, nope"); // ["bug", "feature"]
 * ```
 */
function parseLabels(value: string): LabelKey[] {
  const tokens = new Set(
    value
      .split(",")
      .map(token => token.trim().toLowerCase())
      .filter(Boolean)
  );
  const keys = LABEL_KEYS.filter(key => tokens.has(key) || tokens.has(LABELS[key].toLowerCase()));
  return [...keys];
}

/**
 * Edit the issue's assignees via a comma-separated prompt of names/initials; the first listed becomes
 * the lead. Unknown people are dropped; an empty value unassigns everyone.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the assignee set persists.
 * @example
 * ```ts
 * await editAssignees(ctx);
 * ```
 */
async function editAssignees(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = detail.assignees
    .map(({ personId }) => personById(personId)?.name ?? personId)
    .join(", ");
  const result = await openModal({
    variant: "prompt",
    title: "Assignees",
    message: `Comma-separated names (first = lead): ${PEOPLE.map(p => p.name).join(", ")}`,
    placeholder: "Anya Kovač, Mateo Luna",
    initialValue: current
  });
  if (result.kind !== "submit") return;

  const assignees = parseAssignees(result.value);
  await patchIssue(detail.issue.id, { assignees });
  showToast("Assignees updated");
}

/**
 * Parse a comma-separated assignee prompt into `{ personId, isLead }[]` — matching on name or initials
 * (case-insensitive). The first recognized person is the lead; unknowns and duplicates are dropped.
 *
 * @param value - The raw comma-separated prompt value.
 * @returns The recognized assignees, the first marked as lead.
 * @example
 * ```ts
 * parseAssignees("Anya Kovač, RT"); // [{ personId: "ak", isLead: true }, { personId: "rt", isLead: false }]
 * ```
 */
function parseAssignees(value: string): { personId: string; isLead: boolean }[] {
  const tokens = value
    .split(",")
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);

  const ids: string[] = [];
  for (const token of tokens) {
    const person = PEOPLE.find(
      p => p.name.toLowerCase() === token || p.initials.toLowerCase() === token
    );
    if (person && !ids.includes(person.id)) ids.push(person.id);
  }
  return ids.map((personId, index) => ({ personId, isLead: index === 0 }));
}

/**
 * Set or clear the issue's due date via the date modal (Clear / Cancel / Save).
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the due date persists.
 * @example
 * ```ts
 * await editDueDate(ctx);
 * ```
 */
async function editDueDate(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "date",
    title: "Set due date",
    initialValue: toDateInput(detail.issue.dueAt)
  });
  if (result.kind === "clear") {
    // eslint-disable-next-line unicorn/no-null -- null is the dueAt domain contract (clears the date)
    await patchIssue(detail.issue.id, { dueAt: null });
    showToast("Due date cleared");
    return;
  }
  if (result.kind !== "submit") return;

  const dueAt = fromDateInput(result.value);
  await patchIssue(detail.issue.id, { dueAt });
  showToast("Due date set");
}

/**
 * Format an epoch-ms timestamp as a `yyyy-mm-dd` value for the date input (empty when unset).
 *
 * @param at - The timestamp in epoch milliseconds, or null.
 * @returns The `yyyy-mm-dd` string, or `""` when unset.
 * @example
 * ```ts
 * toDateInput(Date.UTC(2026, 2, 12)); // "2026-03-12"
 * ```
 */
function toDateInput(at: number | null): string {
  if (at === null) return "";
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Parse a `yyyy-mm-dd` date-input value into an epoch-ms timestamp, or null when blank/invalid.
 *
 * @param value - The date-input value.
 * @returns The midnight-UTC epoch timestamp, or null.
 * @example
 * ```ts
 * fromDateInput("2026-03-12"); // 1773532800000
 * ```
 */
function fromDateInput(value: string): number | null {
  const trimmed = value.trim();
  // eslint-disable-next-line unicorn/no-null -- null is the dueAt domain contract (blank clears the date)
  if (!trimmed) return null;
  const at = Date.parse(`${trimmed}T00:00:00Z`);
  // eslint-disable-next-line unicorn/no-null -- null is the dueAt domain contract (invalid clears the date)
  return Number.isNaN(at) ? null : Math.floor(at / DAY_MS) * DAY_MS;
}

/**
 * Edit the issue's estimate (story points) via a prompt; an empty/invalid value clears it.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the estimate persists.
 * @example
 * ```ts
 * await editEstimate(ctx);
 * ```
 */
async function editEstimate(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "prompt",
    title: "Estimate (points)",
    placeholder: "3",
    initialValue: detail.issue.estimate === null ? "" : String(detail.issue.estimate)
  });
  if (result.kind !== "submit") return;

  const parsed = Number.parseInt(result.value.trim(), 10);
  // eslint-disable-next-line unicorn/no-null -- null is the estimate domain contract (clears the estimate)
  const estimate = Number.isNaN(parsed) ? null : parsed;
  await patchIssue(detail.issue.id, { estimate });
  showToast("Estimate updated");
}

/**
 * Edit the issue's reporter via a name/initials prompt; an empty value clears it.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the reporter persists.
 * @example
 * ```ts
 * await editReporter(ctx);
 * ```
 */
async function editReporter(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = detail.issue.reporterId ? (personById(detail.issue.reporterId)?.name ?? "") : "";
  const result = await openModal({
    variant: "prompt",
    title: "Reporter",
    message: `One of: ${PEOPLE.map(p => p.name).join(", ")}`,
    placeholder: "Anya Kovač",
    initialValue: current
  });
  if (result.kind !== "submit") return;

  const token = result.value.trim().toLowerCase();
  const person = token
    ? PEOPLE.find(p => p.name.toLowerCase() === token || p.initials.toLowerCase() === token)
    : undefined;
  // eslint-disable-next-line unicorn/no-null -- null is the reporterId domain contract (clears the reporter)
  await patchIssue(detail.issue.id, { reporterId: person?.id ?? null });
  showToast("Reporter updated");
}

/**
 * Edit the issue's milestone / cycle via a prompt; an empty value clears it.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the milestone persists.
 * @example
 * ```ts
 * await editMilestone(ctx);
 * ```
 */
async function editMilestone(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "prompt",
    title: "Milestone / Cycle",
    placeholder: "Sprint 12",
    initialValue: detail.issue.milestone ?? ""
  });
  if (result.kind !== "submit") return;

  // eslint-disable-next-line unicorn/no-null -- null is the milestone domain contract (clears the milestone)
  const milestone = result.value.trim() || null;
  await patchIssue(detail.issue.id, { milestone });
  showToast("Milestone updated");
}

/** Maps each editable rail field's label to its edit action. */
const RAIL_EDITS: Record<string, (ctx: IssueContext) => void | Promise<void>> = {
  Status: cycleStatus,
  Priority: cyclePriority,
  Labels: editLabels,
  Assignees: editAssignees,
  "Due date": editDueDate,
  Estimate: editEstimate,
  Reporter: editReporter,
  "Milestone / Cycle": editMilestone
};

/**
 * Handle a click within the properties rail: route the clicked `[data-rail-field]` to its edit action,
 * keyed by the field's `[data-rail-label]` caption.
 *
 * @param ctx - The issue component context.
 * @param _event - The delegated click event (unused).
 * @param field - The matched `[data-rail-field]` element.
 * @example
 * ```ts
 * events: { "click [data-rail-field]": onRailEdit };
 * ```
 */
export function onRailEdit(ctx: IssueContext, _event: Event, field: Element): void {
  const label = field.querySelector<HTMLElement>("[data-rail-label]")?.textContent?.trim();
  if (!label) return;
  const edit = RAIL_EDITS[label];
  if (edit) void edit(ctx);
}

// ─── properties rail: customize + add property ───────────────────────────────

/**
 * Open the Customize panel for the issue element (the rail's icon "Customize" row). The returning
 * `customized` patch (board-scoped) updates the icon live; `onApplied` keeps it in sync immediately.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * openIssueCustomize(ctx);
 * ```
 */
function openIssueCustomize(ctx: IssueContext): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  openCustomize({
    elementType: "issue",
    elementId: detail.issue.id,
    boardId: ctx.state.boardId,
    elementLabel: detail.issue.title,
    // eslint-disable-next-line unicorn/no-null -- null is the customize color contract
    color: ctx.state.customization?.color ?? null,
    // eslint-disable-next-line unicorn/no-null -- null is the customize icon contract
    icon: ctx.state.customization?.icon ?? null,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onApplied: sync the applied customization into state
    onApplied: (color, icon) => {
      ctx.set({
        customization: {
          elementType: "issue",
          elementId: detail.issue.id,
          boardId: ctx.state.boardId,
          color,
          icon
        }
      });
    }
  });
}

/**
 * Handle the "+ Add property" affordance — reveal the next unset optional rail field by surfacing its
 * editor (the component keeps unset fields out of the way; here we open the estimate/due/milestone
 * editors in turn). Opens the due-date editor as the first sensible default.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * revealNextProperty(ctx);
 * ```
 */
function revealNextProperty(ctx: IssueContext): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  // Reveal the first still-unset optional field (due → estimate → milestone).
  if (detail.issue.dueAt === null) void editDueDate(ctx);
  else if (detail.issue.estimate === null) void editEstimate(ctx);
  else void editMilestone(ctx);
}

// ─── header: the [data-action] dispatcher (close · ⋯ · attach · customize · add) ─

/**
 * The single delegated `[data-action]` dispatcher — every action button in the panel (the header ×
 * and ⋯, the scrim, "Attach file", the rail icon "Customize", "+ Add property", and each sub-issue's
 * ⋯) routes here by its `data-action` token. Sub-issue menus are told apart by their `data-sub-id`.
 *
 * @param ctx - The issue component context.
 * @param event - The delegated click event.
 * @param element - The matched `[data-action]` element.
 * @example
 * ```ts
 * events: { "click [data-action]": onAction };
 * ```
 */
export function onAction(ctx: IssueContext, event: Event, element: Element): void {
  if (!(element instanceof HTMLElement) || !ctx.state.detail) return;
  const action = element.dataset.action;

  // A sub-issue's ⋯ carries a sub-id — route it to the sub-issue menu, not the header menu.
  if (action === "menu" && element.dataset.subId) {
    openSubMenu(ctx, element);
    return;
  }

  switch (action) {
    case "close": {
      event.preventDefault();
      closeToBoard(ctx);
      return;
    }
    case "menu": {
      openHeaderMenu(ctx, element);
      return;
    }
    case "attach": {
      pickAndUpload(ctx);
      return;
    }
    case "customize": {
      openIssueCustomize(ctx);
      return;
    }
    case "add-property": {
      revealNextProperty(ctx);
      return;
    }
    default: {
      return;
    }
  }
}

/**
 * Open the universal element menu for the issue, anchored to the header "⋯" button — routing rename /
 * customize / delete / move through the shared bus.
 *
 * @param ctx - The issue component context.
 * @param button - The header "⋯" button (the popover anchor).
 * @example
 * ```ts
 * openHeaderMenu(ctx, button);
 * ```
 */
function openHeaderMenu(ctx: IssueContext, button: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  openMenu({
    variant: "element",
    anchor: button,
    elementLabel: detail.issue.title,
    canMove: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onAction: route the chosen header-menu action
    onAction: action => void onMenuAction(ctx, action)
  });
}

/**
 * Route a chosen "⋯" menu action: rename (prompt), customize (panel), delete (confirm → remove → back
 * to the board), or move (best-effort prompt to a status/column).
 *
 * @param ctx - The issue component context.
 * @param action - The action token (`rename` · `customize` · `delete` · `move`).
 * @returns A promise that resolves once the action completes.
 * @example
 * ```ts
 * onMenuAction(ctx, "delete");
 * ```
 */
async function onMenuAction(ctx: IssueContext, action: string): Promise<void> {
  if (action === "rename") {
    await editTitle(ctx);
    return;
  }
  if (action === "customize") {
    openIssueCustomize(ctx);
    return;
  }
  if (action === "delete") {
    await deleteOpenIssue(ctx);
    return;
  }
  if (action === "move") {
    await moveOpenIssue(ctx);
  }
}

/**
 * Confirm and delete the open issue, then navigate back to its board.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the delete persists (or is cancelled).
 * @example
 * ```ts
 * await deleteOpenIssue(ctx);
 * ```
 */
async function deleteOpenIssue(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "delete",
    title: "Delete this issue?",
    message: "This can't be undone.",
    confirmLabel: "Delete"
  });
  if (result.kind !== "confirm") return;

  await deleteIssue(detail.issue.id);
  showToast("Issue deleted", "danger");
  closeToBoard(ctx);
}

/**
 * Move the open issue to another status/column via a prompt (the touch + accessibility path to drag —
 * the rich drag-reorder lives on the board). Sets the matching status; the board reconciles position.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the move persists (or is cancelled).
 * @example
 * ```ts
 * await moveOpenIssue(ctx);
 * ```
 */
async function moveOpenIssue(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "prompt",
    title: "Move to…",
    message: `One of: ${STATUS_ORDER.map(status => STATUS_TITLES[status]).join(", ")}`,
    placeholder: "In Progress",
    initialValue: STATUS_TITLES[detail.issue.status]
  });
  if (result.kind !== "submit") return;

  const token = result.value.trim().toLowerCase();
  const status = STATUS_ORDER.find(s => STATUS_TITLES[s].toLowerCase() === token);
  if (!status || status === detail.issue.status) return;

  await patchIssue(detail.issue.id, { status });
  showToast(`Moved to ${STATUS_TITLES[status]}`);
}

/**
 * Open the element menu for a sub-issue row's "⋯" button — delete that sub-issue (sub-issues have no
 * rename/customize, so the menu offers only delete; no "Move to…").
 *
 * @param ctx - The issue component context.
 * @param button - The sub-issue "⋯" button (carries `data-sub-id`; the popover anchor).
 * @example
 * ```ts
 * openSubMenu(ctx, button);
 * ```
 */
function openSubMenu(ctx: IssueContext, button: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const subId = button.dataset.subId;
  if (!subId) return;

  const sub = detail.subIssues.find(item => item.id === subId);
  openMenu({
    variant: "element",
    anchor: button,
    ...(sub ? { elementLabel: sub.title } : {}),
    canMove: false,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onAction: route the chosen sub-issue-menu action
    onAction: action => void onSubMenuAction(ctx, subId, action)
  });
}

/**
 * Route a sub-issue "⋯" action: rename (prompt → patch is unsupported for sub-issues, so re-create is
 * out of scope; we only support delete here) or delete (confirm → remove).
 *
 * @param ctx - The issue component context.
 * @param subId - The sub-issue id.
 * @param action - The action token (`delete`).
 * @returns A promise that resolves once the action completes.
 * @example
 * ```ts
 * onSubMenuAction(ctx, "s1", "delete");
 * ```
 */
async function onSubMenuAction(ctx: IssueContext, subId: string, action: string): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || action !== "delete") return;

  const result = await openModal({
    variant: "delete",
    title: "Delete this sub-issue?",
    message: "This can't be undone.",
    confirmLabel: "Delete"
  });
  if (result.kind !== "confirm") return;

  await removeSubIssue(detail.issue.id, subId);
  showToast("Sub-issue deleted", "danger");
}
