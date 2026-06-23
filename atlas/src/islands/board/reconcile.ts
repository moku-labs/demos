/**
 * @file board island — the realtime reconcile: how the SERVER drives the board (the counterpart to
 * handlers.ts, where the user drives it). `applyPatch` switches over EVERY {@link BoardPatch} variant
 * the Board Durable Object fans out and updates the snapshot immutably via `ctx.set`. The `default:
 * patch satisfies never` arm keeps the switch exhaustive — a new patch variant fails the build until
 * it is handled here. Mutations the local user makes round-trip through `lib/api` and come back as one
 * of these patches, so reconcile is the single place the board's live state is mutated.
 */
import { navigate } from "../../lib/nav";
import type { BoardPatch, Customization } from "../../lib/types";
import { urls } from "../../routes";
import { placeColumnAt, placeIssueInColumn } from "./snapshot";
import type { BoardContext } from "./types";

/**
 * Apply a realtime patch to the board snapshot (immutably) via `ctx.set` — the live reconcile. Every
 * arm rebuilds only the slice it touches; unrelated readers keep their references.
 *
 * @param ctx - The board island context.
 * @param patch - The patch frame from the Board Durable Object.
 * @example
 * ```ts
 * onPatch(patch => applyPatch(ctx, patch));
 * ```
 */
export function applyPatch(ctx: BoardContext, patch: BoardPatch): void {
  switch (patch.type) {
    // ─── columns ─────────────────────────────────────────────────────────────
    case "column.created": {
      // Dedupe by id — append only when this column is new. The acting client's own create round-trips
      // back as this same patch, and a reconciler MUST be idempotent (one create can be delivered more
      // than once), so a re-delivery never grows a second, duplicate-keyed column.
      ctx.set(previous =>
        previous.snapshot.columns.some(column => column.id === patch.column.id)
          ? {}
          : {
              snapshot: {
                ...previous.snapshot,
                columns: [...previous.snapshot.columns, patch.column]
              }
            }
      );
      return;
    }
    case "column.renamed": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          columns: previous.snapshot.columns.map(column =>
            column.id === patch.columnId ? { ...column, title: patch.title } : column
          )
        }
      }));
      return;
    }
    case "column.deleted": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          columns: previous.snapshot.columns.filter(column => column.id !== patch.columnId),
          issues: previous.snapshot.issues.filter(issue => issue.columnId !== patch.columnId)
        }
      }));
      return;
    }
    case "column.reordered": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          columns: placeColumnAt(previous.snapshot.columns, patch.columnId, patch.position)
        }
      }));
      return;
    }

    // ─── issues ──────────────────────────────────────────────────────────────
    case "issue.created": {
      // Dedupe by id — append only when this issue is new. The acting client's own create round-trips
      // back as this same patch, and a reconciler MUST be idempotent (one create can be delivered more
      // than once), so a re-delivery never grows a second copy of the card.
      ctx.set(previous =>
        previous.snapshot.issues.some(issue => issue.id === patch.issue.id)
          ? {}
          : {
              snapshot: {
                ...previous.snapshot,
                issues: [...previous.snapshot.issues, patch.issue]
              }
            }
      );
      return;
    }
    case "issue.moved": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          issues: placeIssueInColumn(
            previous.snapshot.issues,
            patch.issueId,
            patch.toColumnId,
            patch.position,
            patch.status
          )
        }
      }));
      return;
    }
    case "issue.updated": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          issues: previous.snapshot.issues.map(issue =>
            issue.id === patch.issue.id ? patch.issue : issue
          )
        }
      }));
      return;
    }
    case "issue.deleted": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          issues: previous.snapshot.issues.filter(issue => issue.id !== patch.issueId)
        }
      }));
      return;
    }

    // ─── sub-issues (drive the card's progress count) ──────────────────────────
    case "subIssue.added": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          subIssues: [...previous.snapshot.subIssues, patch.subIssue]
        }
      }));
      return;
    }
    case "subIssue.toggled": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          subIssues: previous.snapshot.subIssues.map(sub =>
            sub.id === patch.subIssueId ? { ...sub, done: patch.done } : sub
          )
        }
      }));
      return;
    }
    case "subIssue.removed": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          subIssues: previous.snapshot.subIssues.filter(sub => sub.id !== patch.subIssueId)
        }
      }));
      return;
    }

    // ─── property change (labels/assignees/priority/due reflect on the card) ───
    case "property.changed": {
      applyPropertyChange(ctx, patch.issueId, patch.patch);
      return;
    }

    // ─── attachments (drive the card's file count) ─────────────────────────────
    case "attachment.added": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          attachments: [...previous.snapshot.attachments, patch.attachment]
        }
      }));
      return;
    }
    case "attachment.removed": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          attachments: previous.snapshot.attachments.filter(
            attachment => attachment.id !== patch.attachmentId
          )
        }
      }));
      return;
    }

    // ─── customization (the element's live colour/icon) ────────────────────────
    case "customized": {
      applyCustomized(ctx, patch);
      return;
    }

    // ─── board (rename in place; navigate away on delete) ──────────────────────
    case "board.renamed": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          board: { ...previous.snapshot.board, title: patch.title }
        }
      }));
      return;
    }
    case "board.deleted": {
      // The board this instance is bound to was deleted out from under us — leave for home.
      navigate(urls.toUrl("home", {}));
      return;
    }

    default: {
      // Exhaustiveness guard: a new BoardPatch variant fails the build until handled above.
      patch satisfies never;
    }
  }
}

/**
 * Fold a `property.changed` patch into the snapshot: scalar fields update the issue row; the label and
 * assignee arrays (when present) replace that issue's join rows so the card's dots/avatars track live.
 *
 * @param ctx - The board island context.
 * @param issueId - The issue whose properties changed.
 * @param patch - The changed fields (scalars + optional labels/assignees).
 * @example
 * ```ts
 * applyPropertyChange(ctx, issueId, { priority: "high", labels: ["bug"] });
 * ```
 */
function applyPropertyChange(
  ctx: BoardContext,
  issueId: string,
  patch: Extract<BoardPatch, { type: "property.changed" }>["patch"]
): void {
  const { labels, assignees, ...scalars } = patch;
  ctx.set(previous => {
    // Scalar issue fields (title/status/priority/due/…) update the issue row in place.
    const issues = previous.snapshot.issues.map(issue =>
      issue.id === issueId ? { ...issue, ...scalars } : issue
    );

    // Labels/assignees, when present, replace this issue's join rows wholesale.
    const labelRows = labels
      ? [
          ...previous.snapshot.labels.filter(row => row.issueId !== issueId),
          ...labels.map(label => ({ issueId, label }))
        ]
      : previous.snapshot.labels;
    const assigneeRows = assignees
      ? [
          ...previous.snapshot.assignees.filter(row => row.issueId !== issueId),
          ...assignees.map(({ personId, isLead }) => ({ issueId, personId, isLead }))
        ]
      : previous.snapshot.assignees;

    return {
      snapshot: { ...previous.snapshot, issues, labels: labelRows, assignees: assigneeRows }
    };
  });
}

/**
 * Fold a `customized` patch into the snapshot's customizations — replacing the matching element's
 * colour/icon row (or adding it) so the card/column repaints its leading icon live.
 *
 * @param ctx - The board island context.
 * @param patch - The customization patch (element identity + new colour/icon).
 * @example
 * ```ts
 * applyCustomized(ctx, { type: "customized", elementType: "issue", elementId, color, icon });
 * ```
 */
function applyCustomized(
  ctx: BoardContext,
  patch: Extract<BoardPatch, { type: "customized" }>
): void {
  ctx.set(previous => {
    const others = previous.snapshot.customizations.filter(
      custom => !(custom.elementType === patch.elementType && custom.elementId === patch.elementId)
    );
    const next: Customization = {
      elementType: patch.elementType,
      elementId: patch.elementId,
      boardId: previous.snapshot.board.id,
      color: patch.color,
      icon: patch.icon
    };
    return { snapshot: { ...previous.snapshot, customizations: [...others, next] } };
  });
}
