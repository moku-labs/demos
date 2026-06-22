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
import type { ChooserOption } from "../../lib/menu";
import { openChooser, openCustomize, openMenu, openModal, showToast } from "../../lib/menu";
import { PEOPLE } from "../../lib/people";
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
 * Show a full-screen lightbox preview for an image attachment within the panel. The lightbox is a
 * vanilla DOM element layered on top of the panel surface (no Preact re-render needed). It is
 * dismissed by clicking the backdrop, clicking the × button, or pressing Escape.
 *
 * @param href - The attachment URL to preview.
 * @param filename - The attachment filename (shown as the caption).
 * @param size - The formatted byte count (shown as the caption).
 * @example
 * ```ts
 * showLightbox("/api/attachments/abc", "screenshot.png", "1.2 MB");
 * ```
 */
function showLightbox(href: string, filename: string, size: string): void {
  const overlay = document.createElement("div");
  overlay.dataset.lightbox = "";

  // Styles are inline so the lightbox works regardless of @scope containment.
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "200",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.82)",
    backdropFilter: "blur(6px)"
  });

  const img = document.createElement("img");
  img.src = href;
  img.alt = filename;
  Object.assign(img.style, {
    maxWidth: "min(90vw, 72rem)",
    maxHeight: "80vh",
    objectFit: "contain",
    borderRadius: "6px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)"
  });

  const caption = document.createElement("div");
  caption.textContent = `${filename}  ·  ${size}`;
  Object.assign(caption.style, {
    marginTop: "1rem",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "var(--text-2xs, 0.75rem)",
    letterSpacing: "0.04em",
    color: "rgba(255,255,255,0.65)"
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close preview");
  closeButton.textContent = "×";
  Object.assign(closeButton.style, {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    width: "2.4rem",
    height: "2.4rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.12)",
    border: "none",
    borderRadius: "999px",
    color: "#fff",
    fontSize: "1.5rem",
    lineHeight: "1",
    cursor: "pointer"
  });

  // appendChild (not append): @cloudflare/workers-types merges Element.append into a conflicting
  // overload set in this project (see nav.ts), so the DOM helper is used explicitly.
  /* eslint-disable unicorn/prefer-dom-node-append -- workers-types overload conflict, see above */
  overlay.appendChild(img);
  overlay.appendChild(caption);
  overlay.appendChild(closeButton);
  document.body.appendChild(overlay);
  /* eslint-enable unicorn/prefer-dom-node-append */

  /**
   * Dismiss the lightbox and remove its DOM node.
   *
   * @example
   * ```ts
   * dismiss();
   * ```
   */
  function dismiss(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }

  /**
   * Close the lightbox on Escape.
   *
   * @param event - The keyboard event.
   * @example
   * ```ts
   * document.addEventListener("keydown", onKey);
   * ```
   */
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") dismiss();
  }

  overlay.addEventListener("click", event => {
    // Dismiss when clicking the backdrop (not the image itself).
    if (event.target === overlay) dismiss();
  });
  closeButton.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKey);
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

    // Image attachment → in-panel lightbox preview.
    if ((link as HTMLElement).dataset.kind === "image") {
      const detail = ctx.state.detail;
      const path = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      const attachmentId = path.split("/").pop();
      const attachment = detail?.attachments.find(att => att.id === attachmentId);
      const { formatBytes } = await import("../../lib/attachments");
      const size = attachment ? formatBytes(attachment.size) : "";
      const filename = attachment?.filename ?? path.split("/").pop() ?? "attachment";
      showLightbox(href, filename, size);
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

// ─── properties rail: chooser-backed edits ───────────────────────────────────

/** Priority ranks in chooser order — `none` first as the "clear" row, then strongest → weakest. */
const PRIORITY_CHOICES: readonly Priority[] = ["none", "urgent", "high", "medium", "low"];

/**
 * Open the Status chooser under the rail field — a single-select list of the board statuses, each with
 * its status dot, the current one checked. Picking persists via {@link applyStatus}.
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

  const options: ChooserOption[] = STATUS_ORDER.map(status => ({
    value: status,
    label: STATUS_TITLES[status],
    ornament: { kind: "status", status },
    selected: status === detail.issue.status
  }));
  openChooser({
    anchor,
    title: "Status",
    options,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline onSelect: persist the chosen status
    onSelect: value => void applyStatus(ctx, value as IssueStatus)
  });
}

/**
 * Persist a chosen status (no-op when unchanged) and confirm with a toast.
 *
 * @param ctx - The issue component context.
 * @param status - The chosen status.
 * @returns A promise that resolves once the change persists.
 * @example
 * ```ts
 * await applyStatus(ctx, "in_progress");
 * ```
 */
async function applyStatus(ctx: IssueContext, status: IssueStatus): Promise<void> {
  const detail = ctx.state.detail;
  if (!detail || status === detail.issue.status) return;

  await patchIssue(detail.issue.id, { status });
  showToast(`Status → ${STATUS_TITLES[status]}`);
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

  await patchIssue(detail.issue.id, { priority });
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
  await patchIssue(detail.issue.id, { labels: [...labels] });
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
  const options: ChooserOption[] = PEOPLE.map(person => ({
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
  const assignees = PEOPLE.filter(person => chosen.has(person.id)).map((person, index) => ({
    personId: person.id,
    isLead: index === 0
  }));
  await patchIssue(detail.issue.id, { assignees });
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
  await patchIssue(detail.issue.id, { estimate });
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
    ...PEOPLE.map(person => ({
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
  await patchIssue(detail.issue.id, { reporterId });
  showToast("Reporter updated");
}

/**
 * Edit the issue's milestone / cycle via a prompt; an empty value clears it.
 *
 * @param ctx - The issue component context.
 * @param _anchor - Unused; the rail field anchor (milestone is free text, edited via a prompt).
 * @returns A promise that resolves once the milestone persists.
 * @example
 * ```ts
 * await editMilestone(ctx);
 * ```
 */
async function editMilestone(ctx: IssueContext, _anchor?: HTMLElement): Promise<void> {
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
 * and ⋯, the scrim, the description Preview/Edit toggle, "Attach file", the rail icon "Customize",
 * "+ Add property", and each sub-issue's ⋯) routes here by its `data-action` token. Sub-issue menus
 * are told apart by their `data-sub-id`.
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
    case "edit-description": {
      // The Edit segment of the visible Preview/Edit control — reveal the inline writer (§7).
      editDescription(ctx);
      return;
    }
    case "preview-description": {
      // The Preview segment — commit the inline writer back to the rendered body (no-op when resting).
      void saveDescription(ctx);
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
