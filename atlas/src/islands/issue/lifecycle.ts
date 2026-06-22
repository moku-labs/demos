/**
 * @file issue island — the route-driven lifecycle. `sync(ctx)` is the single idempotent entry called
 * from BOTH `onMount` (the panel re-mounts inside BoardPage on every nav) and `onNavEnd` (defensive,
 * in case it ever persists): it opens + loads the issue when the route targets one, and hides + clears
 * otherwise. It also wires the realtime subscription (live edits to the OPEN issue) and an Escape key
 * (close back to the board) once, releasing both via `ctx.cleanup`.
 */
import { getBoard, getIssue } from "../../lib/api";
import { navigate } from "../../lib/nav";
import { onPatch } from "../../lib/realtime";
import type {
  BoardPatch,
  BoardSnapshot,
  Customization,
  IssueDetail,
  IssuePatch,
  SubIssue
} from "../../lib/types";
import { urls } from "../../routes";
import { CLOSED_STATE, ESCAPE_KEY, ISSUE_FOCUS, type IssueContext } from "./types";

/**
 * Reveal or hide the host `<aside hidden>` — open the panel by clearing `hidden`, close it by setting
 * it. Toggling the attribute (never a CSS class) is the moku-web way to flip overlay visibility.
 *
 * @param host - The issue island host element.
 * @param open - True to reveal the panel, false to hide it.
 * @example
 * ```ts
 * setHostOpen(ctx.el, true);
 * ```
 */
function setHostOpen(host: Element, open: boolean): void {
  host.toggleAttribute("hidden", !open);
}

/**
 * Find the customization for the issue element within a board snapshot, if any.
 *
 * @param snapshot - The board snapshot (bundles every element's customization).
 * @param issueId - The issue id whose customization to resolve.
 * @returns The matching {@link Customization}, or undefined.
 * @example
 * ```ts
 * const custom = issueCustomization(snapshot, issueId);
 * ```
 */
function issueCustomization(snapshot: BoardSnapshot, issueId: string): Customization | undefined {
  return snapshot.customizations.find(
    custom => custom.elementType === "issue" && custom.elementId === issueId
  );
}

/**
 * Load everything the panel needs for one issue: its detail, its board + the column it sits in, and
 * its customization — fetched together so the breadcrumb and rail render in one pass.
 *
 * @param boardId - The board the issue is filed under.
 * @param issueId - The issue to open.
 * @returns The loaded detail plus the resolved board, column, and customization.
 * @example
 * ```ts
 * const loaded = await loadIssue(boardId, issueId);
 * ```
 */
async function loadIssue(
  boardId: string,
  issueId: string
): Promise<{
  detail: IssueDetail;
  snapshot: BoardSnapshot;
  customization: Customization | undefined;
}> {
  const [detail, snapshot] = await Promise.all([getIssue(issueId), getBoard(boardId)]);
  return { detail, snapshot, customization: issueCustomization(snapshot, issueId) };
}

/**
 * Open + load the issue the route targets, then reveal the panel. Stale-guarded: if the route changed
 * again while the fetch was in flight (the user closed or switched issues), the load is discarded.
 *
 * @param ctx - The issue component context.
 * @param boardId - The board the issue is filed under.
 * @param issueId - The issue to open.
 * @returns A promise that resolves once the panel is loaded + revealed (or the load is discarded).
 * @example
 * ```ts
 * await openIssue(ctx, boardId, issueId);
 * ```
 */
async function openIssue(ctx: IssueContext, boardId: string, issueId: string): Promise<void> {
  // Mark the panel open immediately so concurrent syncs see the target (and don't double-fetch).
  ctx.set({ boardId, issueId });

  const { detail, snapshot, customization } = await loadIssue(boardId, issueId);

  // Stale guard: a later sync may have changed the target issue while we awaited the fetch.
  if (ctx.state.issueId !== issueId) return;

  const column = snapshot.columns.find(col => col.id === detail.issue.columnId);
  ctx.set({
    detail,
    board: snapshot.board,
    column,
    customization
  });
  setHostOpen(ctx.el, true);
}

/**
 * Hide the panel and clear its state — the panel is closed whenever the route is not an issue route.
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * closePanel(ctx);
 * ```
 */
function closePanel(ctx: IssueContext): void {
  setHostOpen(ctx.el, false);
  ctx.set(CLOSED_STATE);
}

/**
 * The single idempotent route → panel reconcile. Opens + loads the issue when the route targets one
 * (`meta.focus === "issue"` + an `issueId`), and hides + clears otherwise. Safe to call from both
 * `onMount` and `onNavEnd`, and re-callable for any number of navigations.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the open/close reconcile completes.
 * @example
 * ```ts
 * createIsland("issue", { onMount: sync, onNavEnd: sync });
 * ```
 */
export async function sync(ctx: IssueContext): Promise<void> {
  const focus = ctx.meta.focus;
  const issueId = ctx.params.issueId;
  const boardId = ctx.params.id;

  // Not an issue route (or missing ids) → the panel must be closed.
  if (focus !== ISSUE_FOCUS || !issueId || !boardId) {
    closePanel(ctx);
    return;
  }

  // Already showing this exact issue → nothing to do (a same-issue nav, e.g. board ⇄ issue toggle).
  if (ctx.state.issueId === issueId && ctx.state.detail) {
    setHostOpen(ctx.el, true);
    return;
  }

  await openIssue(ctx, boardId, issueId);
}

/**
 * Navigate back to the open issue's board (the close gesture for × / scrim / Escape). The subsequent
 * route change re-runs {@link sync}, which hides the panel — so closing is just "go to the board."
 *
 * @param ctx - The issue component context.
 * @example
 * ```ts
 * closeToBoard(ctx);
 * ```
 */
export function closeToBoard(ctx: IssueContext): void {
  const boardId = ctx.state.boardId || ctx.params.id;
  if (!boardId) return;
  navigate(urls.toUrl("board", { id: boardId }));
}

// ─── realtime reconcile ──────────────────────────────────────────────────────

/**
 * Whether a realtime patch concerns the issue currently open in the panel — patches for any other
 * issue (or board-level frames) are ignored so the panel only reflects its own live edits.
 *
 * @param patch - The patch frame from the board Durable Object.
 * @param issueId - The open issue id.
 * @returns True when the patch targets the open issue.
 * @example
 * ```ts
 * if (concernsOpenIssue(patch, ctx.state.issueId)) applyPatch(ctx, patch);
 * ```
 */
function concernsOpenIssue(patch: BoardPatch, issueId: string): boolean {
  switch (patch.type) {
    case "issue.updated": {
      return patch.issue.id === issueId;
    }
    case "property.changed":
    case "subIssue.toggled":
    case "subIssue.removed":
    case "attachment.removed": {
      return patch.issueId === issueId;
    }
    case "subIssue.added": {
      return patch.subIssue.issueId === issueId;
    }
    case "attachment.added": {
      return patch.attachment.issueId === issueId;
    }
    default: {
      return false;
    }
  }
}

/**
 * Apply one realtime patch to the open issue's detail immutably via `ctx.set` — the live reconcile so
 * the panel reflects edits from this and other clients. Patches for other issues are filtered upstream
 * by {@link concernsOpenIssue}.
 *
 * @param ctx - The issue component context.
 * @param patch - The patch frame concerning the open issue.
 * @example
 * ```ts
 * onPatch(patch => applyPatch(ctx, patch));
 * ```
 */
function applyPatch(ctx: IssueContext, patch: BoardPatch): void {
  ctx.set(previous => {
    const detail = previous.detail;
    if (!detail) return {};

    switch (patch.type) {
      // The whole issue row changed (title / status / any property) — replace + re-resolve reporter.
      case "issue.updated": {
        return { detail: { ...detail, issue: patch.issue } };
      }

      // A property edit broadcast — merge the patch fields into the issue, labels, and assignees.
      case "property.changed": {
        return { detail: mergeProperty(detail, patch.patch) };
      }

      // Sub-issue list edits.
      case "subIssue.added": {
        return { detail: { ...detail, subIssues: [...detail.subIssues, patch.subIssue] } };
      }
      case "subIssue.toggled": {
        return {
          detail: {
            ...detail,
            subIssues: toggleSub(detail.subIssues, patch.subIssueId, patch.done)
          }
        };
      }
      case "subIssue.removed": {
        return {
          detail: {
            ...detail,
            subIssues: detail.subIssues.filter(sub => sub.id !== patch.subIssueId)
          }
        };
      }

      // Attachment edits.
      case "attachment.added": {
        return { detail: { ...detail, attachments: [...detail.attachments, patch.attachment] } };
      }
      case "attachment.removed": {
        return {
          detail: {
            ...detail,
            attachments: detail.attachments.filter(att => att.id !== patch.attachmentId)
          }
        };
      }

      default: {
        return {};
      }
    }
  });
}

/**
 * Merge a property-change patch into an issue detail immutably — issue scalar fields, the label set,
 * and the assignee set are each replaced only when present in the patch.
 *
 * @param detail - The current issue detail.
 * @param patch - The property patch broadcast for this issue.
 * @returns A new detail with the patch's fields applied.
 * @example
 * ```ts
 * const next = mergeProperty(detail, { priority: "high", labels: ["bug"] });
 * ```
 */
function mergeProperty(detail: IssueDetail, patch: IssuePatch): IssueDetail {
  const { labels, assignees, ...scalar } = patch;
  return {
    ...detail,
    issue: { ...detail.issue, ...scalar },
    ...(labels ? { labels: labels.map(label => ({ issueId: detail.issue.id, label })) } : {}),
    ...(assignees
      ? {
          assignees: assignees.map(a => ({
            issueId: detail.issue.id,
            personId: a.personId,
            isLead: a.isLead
          }))
        }
      : {})
  };
}

/**
 * Toggle a sub-issue's done flag within a list immutably.
 *
 * @param subs - The current sub-issue list.
 * @param subId - The sub-issue to toggle.
 * @param done - The new done state.
 * @returns A new list with the sub-issue's `done` updated.
 * @example
 * ```ts
 * const next = toggleSub(detail.subIssues, "s1", true);
 * ```
 */
function toggleSub(subs: readonly SubIssue[], subId: string, done: boolean): SubIssue[] {
  return subs.map(sub => (sub.id === subId ? { ...sub, done } : sub));
}

/**
 * Boot the issue island: run the first {@link sync}, then wire the realtime subscription (live edits
 * to the OPEN issue reconcile into state) and an Escape key (close to the board), both released via
 * `ctx.cleanup`. The board island owns the socket lifecycle (connect/seed/disconnect) — here we only
 * add a patch handler.
 *
 * @param ctx - The issue component context.
 * @returns A promise that resolves once the panel is synced and the listeners are wired.
 * @example
 * ```ts
 * createIsland("issue", { onMount: startIssue });
 * ```
 */
export async function startIssue(ctx: IssueContext): Promise<void> {
  // Live patches to the open issue reconcile into state (no re-broadcast — just consume).
  ctx.cleanup(
    onPatch((patch: BoardPatch) => {
      if (concernsOpenIssue(patch, ctx.state.issueId)) applyPatch(ctx, patch);
    })
  );

  // Escape closes the panel back to its board (only while a panel is actually open).
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the global keydown handler
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== ESCAPE_KEY || !ctx.state.detail) return;
    event.preventDefault();
    closeToBoard(ctx);
  };
  document.addEventListener("keydown", onKeydown);
  ctx.cleanup(() => document.removeEventListener("keydown", onKeydown));

  await sync(ctx);
}
