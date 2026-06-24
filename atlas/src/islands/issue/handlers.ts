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
  moveIssue,
  patchIssue,
  removeSubIssue,
  toggleSubIssue
} from "../../lib/api";

import { LABEL_KEYS, LABELS, PRIORITIES, statusForColumnTitle } from "../../lib/labels";
import type { ChooserOption } from "../../lib/menu";
import {
  openChooser,
  openCustomize,
  openMenu,
  openMilestone,
  openModal,
  showToast
} from "../../lib/menu";
import { allPeople } from "../../lib/people";
import { deliverLocal } from "../../lib/realtime";
import type { IssuePatch, LabelKey, Priority } from "../../lib/types";
import { closeToBoard } from "./lifecycle";
import { openAttachmentPreview } from "./lightbox";
import type { IssueContext } from "./types";

/** MIME type used when a selected file reports none. */
const FALLBACK_TYPE = "application/octet-stream";

/** Milliseconds in a day — used to render `dueAt` as a date-input value and back. */
const DAY_MS = 86_400_000;

// ─── article: title ──────────────────────────────────────────────────────────

/**
 * Begin an inline title edit (the article title's double-click path): swap the `<h1>` for an editable
 * input, focus + select it, then commit on Enter or blur and cancel on Escape. The keydown/blur
 * listeners are bound directly to the input (not delegated) so they share one `commit` closure — this
 * guards against a double-save (Enter then blur) and lets Escape `stopPropagation` so it cancels the
 * edit instead of the panel's global Escape-to-close. Persists via `patchIssue` (the returning
 * `issue.updated` realtime patch reconciles the title into state + the board card).
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * events: { "dblclick [data-issue-title]": startTitleEdit };
 * ```
 */
export function startTitleEdit(ctx: IssueContext): void {
  const detail = ctx.state.detail;
  if (!detail || ctx.state.editingTitle) return;

  ctx.set({ editingTitle: true });
  ctx.flush();

  const input = ctx.el.querySelector<HTMLInputElement>("[data-title-edit]");
  if (!input) return;
  input.focus();
  input.select();

  let done = false;
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline single-shot commit/cancel for the title input
  const commit = (save: boolean): void => {
    if (done) return;
    done = true;
    input.removeEventListener("blur", onBlur);
    const next = input.value.trim();
    ctx.set({ editingTitle: false });
    if (!save || !next || next === detail.issue.title) return;
    void persistTitle(detail.issue.id, next);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline blur → commit
  const onBlur = (): void => commit(true);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
    } else if (event.key === "Escape") {
      // Cancel — and stop the panel's global Escape handler from closing the whole issue.
      event.preventDefault();
      event.stopPropagation();
      commit(false);
    }
  });
}

/**
 * Persist a new issue title and confirm with a toast — the commit path for the inline title editor.
 *
 * @param issueId - The issue whose title to update.
 * @param title - The trimmed new title.
 * @returns A promise that resolves once the title persists.
 * @example
 * ```ts
 * void persistTitle(issue.id, "New title");
 * ```
 */
async function persistTitle(issueId: string, title: string): Promise<void> {
  await patchIssue(issueId, { title });
  showToast("Issue renamed");
}

/**
 * Rename the issue via the prompt modal — the "⋯ → Rename" header-menu path (the inline double-click
 * path is {@link startTitleEdit}).
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

// ─── article: description ────────────────────────────────────────────────────

/**
 * Open the inline markdown writer — flip `editingDescription` so the component swaps the rendered
 * `[data-issue-body]` for a full-width `[data-desc-edit]` textarea seeded with the raw source (§7's
 * Preview/Edit affordance). The render binding re-runs on this `ctx.set`, marking the visible
 * `[data-desc-toggle]` Edit segment active. Committing happens on the Preview segment via
 * {@link saveDescription} — there is no prompt modal (full markdown must stay visible, not clipped in a
 * single-line input).
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * editDescription(ctx); // reveals the inline <textarea data-desc-edit>
 * ```
 */
function editDescription(ctx: IssueContext): void {
  if (!ctx.state.detail) return;
  ctx.set({ editingDescription: true });
}

/**
 * Commit the inline writer and return to the rendered preview — read the live `[data-desc-edit]`
 * textarea value from the host, persist it via `patchIssue` when it changed, then flip
 * `editingDescription` off so the component re-renders the markdown body. The returning realtime patch
 * reconciles the body text; here we only close the writer and toast. A no-op when the writer isn't open.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once any change persists and the writer closes.
 * @example
 * ```ts
 * await saveDescription(ctx); // Preview segment / dblclick-back commits the textarea
 * ```
 */
async function saveDescription(ctx: IssueContext): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || !ctx.state.editingDescription) return;

  const field = ctx.el.querySelector<HTMLTextAreaElement>("[data-desc-edit]");
  const next = field?.value ?? detail.issue.description;

  ctx.set({ editingDescription: false });
  if (next === detail.issue.description) return;

  await patchIssue(detail.issue.id, { description: next });
  showToast("Description updated");
}

/**
 * Discard the in-progress description edit without persisting — the explicit Cancel button path.
 * Sets `editingDescription: false` without reading the textarea value, leaving the stored description
 * unchanged. The preview is rendered with the existing description on the next frame.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * cancelDescription(ctx); // Cancel button click — discard and return to preview
 * ```
 */
function cancelDescription(ctx: IssueContext): void {
  ctx.set({ editingDescription: false });
}

/**
 * Handle keydown inside the description textarea. Intercepts Escape to cancel the edit (returning to
 * the preview without persisting) and stops the event's propagation so it does NOT bubble up to the
 * panel's global Escape-to-close handler — pressing Escape inside the editor must close the editor,
 * not the whole panel. All other keys (including Enter, which adds a newline as expected in a
 * textarea) are left untouched.
 *
 * @param ctx - The issue component context.
 * @param event - The delegated keydown event from `[data-desc-edit]`.
 * @example
 * ```ts
 * events: { "keydown [data-desc-edit]": onDescKeydown };
 * ```
 */
export function onDescKeydown(ctx: IssueContext, event: Event): void {
  if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
  // Prevent the panel's global `document` Escape-to-close from firing — the editor owns Escape.
  event.stopPropagation();
  cancelDescription(ctx);
}

/**
 * Programmatically commit or cancel the inline title editor — the explicit Save/Cancel button path.
 * The title editor's `commit` closure is already attached to the input's keydown listener; we dispatch
 * a synthetic key event so the same one-shot guard (the `done` flag inside the closure) dedupes the
 * blur that fires when focus leaves the input to the clicked button.
 *
 * @param ctx - The issue component context.
 * @param save - `true` to commit (Save button), `false` to cancel (Cancel button).
 * @example
 * ```ts
 * commitTitleInput(ctx, true);  // Save button
 * commitTitleInput(ctx, false); // Cancel button
 * ```
 */
function commitTitleInput(ctx: IssueContext, save: boolean): void {
  const input = ctx.el.querySelector<HTMLInputElement>("[data-title-edit]");
  if (!input) return;

  // Dispatch a synthetic keydown for Enter (save) or Escape (cancel) — the existing commit closure
  // that startTitleEdit() attached to the input handles the actual state transition.
  const key = save ? "Enter" : "Escape";
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  // If the closure set `done = true` and removed its blur listener, blur now is harmless.
  // On the cancel path the closure also stopPropagation'd, so the panel's Escape handler is safe.
}

// ─── article: attachments ────────────────────────────────────────────────────

/**
 * Upload the file chosen in the "Attach file" input (a real `<input type=file>` opened natively by its
 * wrapping label — no JS `.click()`, which is unreliable on a hidden/detached input). Clears the input
 * after so re-picking the same file fires `change` again.
 *
 * @param ctx - The issue component context.
 * @param _event - The delegated change event (unused).
 * @param field - The matched `[data-attach-input]` file input.
 * @returns A promise that resolves once the upload persists (or no file was chosen).
 * @example
 * ```ts
 * events: { "change [data-attach-input]": onAttachInput };
 * ```
 */
export async function onAttachInput(
  ctx: IssueContext,
  _event: Event,
  field: Element
): Promise<void> {
  const input = field as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await uploadFile(ctx, file);
  input.value = "";
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
  const attachment = await addAttachment(detail.issue.id, safeFile);

  // Optimistically add it now — don't wait for the realtime round-trip (the dev WS broadcast can drop).
  // The returning `attachment.added` patch is deduped by id (see lifecycle.applyPatch).
  ctx.set(previous => {
    const current = previous.detail;
    if (!current || current.attachments.some(att => att.id === attachment.id)) return {};
    return { detail: { ...current, attachments: [...current.attachments, attachment] } };
  });
  showToast("File attached");
}

/**
 * Handle a click on an attachment chip: a plain click on an image shows a lightbox preview; a plain
 * click on a file chip opens in a new tab; an Alt-modified click confirms and deletes the attachment.
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

  const altClick = event instanceof MouseEvent && event.altKey;
  if (!altClick) {
    const href = (link as HTMLAnchorElement).href;
    if (!href) return;

    // Image attachment → open the deep-linkable in-panel lightbox preview (#15).
    if ((link as HTMLElement).dataset.kind === "image") {
      const path = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      const attachmentId = path.split("/").pop();
      if (attachmentId) openAttachmentPreview(ctx, attachmentId, { updateUrl: true });
      return;
    }

    // Non-image file → open in new tab (download).
    globalThis.open(href, "_blank", "noopener");
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
  const sub = await addSubIssue(detail.issue.id, { title });

  // Optimistically append it now (don't wait for the realtime round-trip); the returning
  // `subIssue.added` patch is deduped by id (see lifecycle.applyPatch).
  ctx.set(previous => {
    const current = previous.detail;
    if (!current || current.subIssues.some(item => item.id === sub.id)) return {};
    return { detail: { ...current, subIssues: [...current.subIssues, sub] } };
  });
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

// ─── properties rail: chooser-backed edits ───────────────────────────────────

/** Priority ranks in chooser order — `none` first as the "clear" row, then strongest → weakest. */
const PRIORITY_CHOICES: readonly Priority[] = ["none", "urgent", "high", "medium", "low"];

/**
 * Persist a rail-property patch AND apply it locally immediately (this panel's rail + the board card)
 * via {@link deliverLocal} — so edits update in real time without waiting for the dev-flaky WebSocket
 * echo. The server's returning `property.changed` broadcast reconciles the same patch idempotently.
 *
 * @param ctx - The issue component context.
 * @param patch - The rail property patch to persist + apply.
 * @returns A promise that resolves once the patch persists.
 * @example
 * ```ts
 * await applyProperty(ctx, { priority: "high" });
 * ```
 */
async function applyProperty(ctx: IssueContext, patch: IssuePatch): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;
  await patchIssue(detail.issue.id, patch);
  deliverLocal({ type: "property.changed", issueId: detail.issue.id, patch });
}

/**
 * Open the Status chooser under the rail field — a single-select list of EVERY column on the board (a
 * kanban status IS its column), in board order, each with its status dot, the card's current column
 * checked. Listing all columns (not just the four seeded statuses) lets a card move to a custom column
 * too. Picking persists via {@link applyColumn}.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the popover anchors under.
 * @example
 * ```ts
 * chooseStatus(ctx, field);
 * ```
 */
function chooseStatus(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const columns = ctx.state.columns.toSorted((a, b) => a.position - b.position);
  const options: ChooserOption[] = columns.map(column => ({
    value: column.id,
    label: column.title,
    // A custom column has no canonical status — show the card's own status hue for its dot.
    ornament: { kind: "status", status: statusForColumnTitle(column.title) ?? detail.issue.status },
    selected: column.id === detail.issue.columnId
  }));
  openChooser({
    anchor,
    title: "Status",
    options,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onSelect: move to the chosen column
    onSelect: value => void applyColumn(ctx, value)
  });
}

/**
 * Move the open issue to the chosen column (no-op when it is already there) and confirm with a toast.
 * The card adopts that column's canonical status, or keeps its own when the column is custom — the SAME
 * rule the board drop uses, so however a card reaches a custom column its status is consistent.
 * `moveIssue` updates column + status + position and broadcasts `issue.moved`; the move is applied
 * locally at once (board card + this panel) so it shows without waiting for the WS echo the dev workerd
 * can drop — the returning broadcast reconciles the same move idempotently.
 *
 * @param ctx - The issue component context.
 * @param columnId - The id of the chosen target column.
 * @returns A promise that resolves once the move persists.
 * @example
 * ```ts
 * await applyColumn(ctx, "col-in-review");
 * ```
 */
async function applyColumn(ctx: IssueContext, columnId: string): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || columnId === detail.issue.columnId) return;

  const target = ctx.state.columns.find(column => column.id === columnId);
  if (!target) return;
  const status = statusForColumnTitle(target.title) ?? detail.issue.status;

  await moveIssue(detail.issue.id, { toColumnId: target.id, position: 0, status });
  deliverLocal({
    type: "issue.moved",
    issueId: detail.issue.id,
    toColumnId: target.id,
    position: 0,
    status
  });
  showToast(`Status → ${target.title}`);
}

/**
 * Open the Priority chooser under the rail field — a single-select list (No priority · Urgent → Low),
 * each rank with its ascending-bars mark, the current one checked. Picking persists via
 * {@link applyPriority}.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the popover anchors under.
 * @example
 * ```ts
 * choosePriority(ctx, field);
 * ```
 */
function choosePriority(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = detail.issue.priority ?? "none";
  const options: ChooserOption[] = PRIORITY_CHOICES.map(priority => ({
    value: priority,
    label: priority === "none" ? "No priority" : PRIORITIES[priority],
    ornament: priority === "none" ? { kind: "none" } : { kind: "priority", priority },
    selected: priority === current
  }));
  openChooser({
    anchor,
    title: "Priority",
    options,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onSelect: persist the chosen priority
    onSelect: value => void applyPriority(ctx, value as Priority)
  });
}

/**
 * Persist a chosen priority (no-op when unchanged) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param priority - The chosen priority rank (`none` clears it).
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyPriority(ctx, "high");
 * ```
 */
async function applyPriority(ctx: IssueContext, priority: Priority): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || priority === (detail.issue.priority ?? "none")) return;

  await applyProperty(ctx, { priority });
  showToast(priority === "none" ? "Priority cleared" : `Priority → ${PRIORITIES[priority]}`);
}

/**
 * Open the Labels chooser under the rail field — a multi-select list of the label taxonomy, each with
 * its coloured dot and the applied ones checked. Toggling stays open; dismissing persists the set via
 * {@link applyLabels}.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the popover anchors under.
 * @example
 * ```ts
 * chooseLabels(ctx, field);
 * ```
 */
function chooseLabels(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const applied = new Set(detail.labels.map(({ label }) => label));
  const options: ChooserOption[] = LABEL_KEYS.map(key => ({
    value: key,
    label: LABELS[key],
    ornament: { kind: "label", label: key },
    selected: applied.has(key)
  }));
  openChooser({
    anchor,
    title: "Labels",
    options,
    multi: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onCommit: persist the chosen label set
    onCommit: values => void applyLabels(ctx, values as LabelKey[])
  });
}

/**
 * Persist the chosen label set (taxonomy order) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param values - The chosen label keys.
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyLabels(ctx, ["bug", "docs"]);
 * ```
 */
async function applyLabels(ctx: IssueContext, values: LabelKey[]): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const chosen = new Set(values);
  const labels = LABEL_KEYS.filter(key => chosen.has(key));
  await applyProperty(ctx, { labels: [...labels] });
  showToast("Labels updated");
}

/**
 * Open the Assignees chooser under the rail field — a multi-select list of the demo cast, each with
 * their avatar and the assigned ones checked. Toggling stays open; dismissing persists the set via
 * {@link applyAssignees}.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the popover anchors under.
 * @example
 * ```ts
 * chooseAssignees(ctx, field);
 * ```
 */
function chooseAssignees(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const assigned = new Set(detail.assignees.map(({ personId }) => personId));
  const options: ChooserOption[] = allPeople().map(person => ({
    value: person.id,
    label: person.name,
    ornament: { kind: "person", personId: person.id },
    selected: assigned.has(person.id)
  }));
  openChooser({
    anchor,
    title: "Assignees",
    options,
    multi: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onCommit: persist the chosen assignees
    onCommit: values => void applyAssignees(ctx, values)
  });
}

/**
 * Persist the chosen assignees (cast order; the first becomes the lead) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param values - The chosen person ids.
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyAssignees(ctx, ["ak", "rt"]);
 * ```
 */
async function applyAssignees(ctx: IssueContext, values: string[]): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const chosen = new Set(values);
  const assignees = allPeople()
    .filter(person => chosen.has(person.id))
    .map((person, index) => ({ personId: person.id, isLead: index === 0 }));
  await applyProperty(ctx, { assignees });
  showToast("Assignees updated");
}

/**
 * Set or clear the issue's due date via the date modal (Clear / Cancel / Save).
 *
 * @param ctx - The issue component context.
 * @param _anchor - Unused; the rail field anchor (the date editor is a modal, not an anchored popover).
 * @returns A promise that resolves once the due date persists.
 * @example
 * ```ts
 * await editDueDate(ctx);
 * ```
 */
async function editDueDate(ctx: IssueContext, _anchor?: HTMLElement): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  const result = await openModal({
    variant: "date",
    title: "Set due date",
    initialValue: toDateInput(detail.issue.dueAt)
  });
  if (result.kind === "clear") {
    // eslint-disable-next-line unicorn/no-null -- null is the dueAt domain contract (clears the date)
    await applyProperty(ctx, { dueAt: null });
    showToast("Due date cleared");
    return;
  }
  if (result.kind !== "submit") return;

  const dueAt = fromDateInput(result.value);
  await applyProperty(ctx, { dueAt });
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
 * @param _anchor - Unused; the rail field anchor (estimate is a free number, edited via a prompt).
 * @returns A promise that resolves once the estimate persists.
 * @example
 * ```ts
 * await editEstimate(ctx);
 * ```
 */
async function editEstimate(ctx: IssueContext, _anchor?: HTMLElement): Promise<void> {
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
  await applyProperty(ctx, { estimate });
  showToast("Estimate updated");
}

/**
 * Open the Reporter chooser under the rail field — a single-select list of the demo cast (with a "No
 * reporter" clear row), each with their avatar and the current one checked. Picking persists via
 * {@link applyReporter}.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the popover anchors under.
 * @example
 * ```ts
 * chooseReporter(ctx, field);
 * ```
 */
function chooseReporter(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  const current = detail.issue.reporterId;
  const options: ChooserOption[] = [
    { value: "", label: "No reporter", ornament: { kind: "none" }, selected: !current },
    ...allPeople().map(person => ({
      value: person.id,
      label: person.name,
      ornament: { kind: "person" as const, personId: person.id },
      selected: current === person.id
    }))
  ];
  openChooser({
    anchor,
    title: "Reporter",
    options,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onSelect: persist the chosen reporter
    onSelect: value => void applyReporter(ctx, value)
  });
}

/**
 * Persist the chosen reporter (the empty value clears it) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param value - The chosen person id, or `""` to clear the reporter.
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyReporter(ctx, "ak");
 * ```
 */
async function applyReporter(ctx: IssueContext, value: string): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail) return;

  // eslint-disable-next-line unicorn/no-null -- null is the reporterId domain contract (clears the reporter)
  const reporterId = value === "" ? null : value;
  if (reporterId === detail.issue.reporterId) return;
  await applyProperty(ctx, { reporterId });
  showToast("Reporter updated");
}

/**
 * Open the milestone picker under the rail field — the board's remembered milestone catalog (pick · add
 * · rename · delete). Picking assigns via {@link applyMilestone}; rename/delete are catalog admin the
 * picker performs itself.
 *
 * @param ctx - The issue component context.
 * @param anchor - The rail field the picker anchors under.
 * @example
 * ```ts
 * editMilestone(ctx, field);
 * ```
 */
function editMilestone(ctx: IssueContext, anchor: HTMLElement): void {
  const detail = ctx.state.detail;
  if (!detail) return;

  openMilestone({
    anchor,
    boardId: ctx.state.boardId,
    current: detail.issue.milestone,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onAssign: persist the chosen milestone
    onAssign: value => void applyMilestone(ctx, value)
  });
}

/**
 * Persist a chosen milestone on the issue (no-op when unchanged) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param milestone - The chosen milestone name, or `null` to clear it.
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyMilestone(ctx, "Sprint 12");
 * ```
 */
async function applyMilestone(ctx: IssueContext, milestone: string | null): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || milestone === detail.issue.milestone) return;

  await applyProperty(ctx, { milestone });
  showToast(milestone ? "Milestone updated" : "Milestone cleared");
}

/**
 * Maps each editable rail field's label to its edit action. List-valued fields (Status · Priority ·
 * Labels · Assignees · Reporter) open the anchored chooser popover; the free-form fields (Due date ·
 * Estimate · Milestone) open a modal and ignore the anchor.
 */
const RAIL_EDITS: Record<string, (ctx: IssueContext, anchor: HTMLElement) => void | Promise<void>> =
  {
    Status: chooseStatus,
    Priority: choosePriority,
    Labels: chooseLabels,
    Assignees: chooseAssignees,
    "Due date": editDueDate,
    Estimate: editEstimate,
    Reporter: chooseReporter,
    "Milestone / Cycle": editMilestone
  };

/**
 * Handle a click within the properties rail: route the clicked `[data-rail-field]` to its edit action,
 * keyed by the field's `[data-rail-label]` caption, anchoring any chooser popover to the field itself.
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
  if (!(field instanceof HTMLElement)) return;
  const label = field.querySelector<HTMLElement>("[data-rail-label]")?.textContent?.trim();
  if (!label) return;
  const edit = RAIL_EDITS[label];
  if (edit) void edit(ctx, field);
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

// ─── header: the [data-action] dispatcher (close · ⋯ · attach · customize) ───────

/**
 * The single delegated `[data-action]` dispatcher — every action button in the panel (the header ×
 * and ⋯, the scrim, the description Preview/Edit toggle, the rail icon "Customize", and each
 * sub-issue's ⋯) routes here by its `data-action` token. Sub-issue menus are told apart by their
 * `data-sub-id`. ("Attach file" is a native `<label>` + file input, handled by `onAttachInput`.)
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
    case "customize": {
      openIssueCustomize(ctx);
      return;
    }
    case "edit-description": {
      // The Edit segment of the visible Preview/Edit control — reveal the inline writer (§7).
      editDescription(ctx);
      return;
    }
    case "preview-description":
    case "save-description": {
      // Both commit the inline writer back to the rendered body via the same path: the Preview segment
      // of the toggle and the explicit Save button below the textarea (a no-op when nothing changed).
      void saveDescription(ctx);
      return;
    }
    case "cancel-description": {
      // Explicit Cancel button — discard changes and return to the preview without persisting.
      cancelDescription(ctx);
      return;
    }
    case "save-title": {
      // Explicit Save button below the title input — fire a synthetic Enter to the existing commit
      // closure; the blur guards dedupe any blur that fires first (focus leaves input to button).
      commitTitleInput(ctx, true);
      return;
    }
    case "cancel-title": {
      // Explicit Cancel button — fire a synthetic Escape to the existing commit closure so the
      // keydown handler cancels cleanly (stopPropagation also prevents the panel's Escape-to-close).
      commitTitleInput(ctx, false);
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
 * Move the open issue to another column via a prompt (the touch + accessibility path to drag — the
 * rich drag-reorder lives on the board). Accepts ANY column title (not just the seeded statuses), then
 * delegates to {@link applyColumn} so it moves the card and adopts the column's status identically.
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

  const columns = ctx.state.columns.toSorted((a, b) => a.position - b.position);
  const result = await openModal({
    variant: "prompt",
    title: "Move to…",
    message: `One of: ${columns.map(column => column.title).join(", ")}`,
    placeholder: columns[0]?.title ?? "Column",
    initialValue: ctx.state.column?.title ?? ""
  });
  if (result.kind !== "submit") return;

  const token = result.value.trim().toLowerCase();
  const target = columns.find(column => column.title.toLowerCase() === token);
  if (!target) return;
  await applyColumn(ctx, target.id);
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
