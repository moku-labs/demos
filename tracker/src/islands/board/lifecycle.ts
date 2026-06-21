/**
 * @file board island — mount lifecycle: load the snapshot, connect the live socket, seed state, wire
 * the keepalive + realtime subscription + the body-level preview overlay (all released via
 * `ctx.cleanup`), then honour any deep-link focus.
 */
import { getBoard } from "../../lib/api";
import { groupAttachmentsByCard } from "../../lib/board-snapshot";
import { focusElement } from "../../lib/focus";
import { connect, disconnect, onPatch, ping } from "../../lib/realtime";
import { onPreviewClick, onPreviewKeydown } from "./preview";
import { applyPatch } from "./reconcile";
import { type BoardContext, KEEPALIVE_MS } from "./types";

/**
 * Honour a deep-link focus after the board renders: `meta.focus === "card"` scrolls to + flashes the
 * `cardId` card; `"activity"` scrolls to + flashes the sibling activity panel. Run from here (the
 * page's tall main content) so target positions are final.
 *
 * @param host - The board host element.
 * @param focus - The route's `meta.focus`.
 * @param cardId - The card to focus (the `card` route's `params.cardId`), if any.
 * @example
 * ```ts
 * focusDeepLink(ctx.el, ctx.meta.focus, ctx.params.cardId);
 * ```
 */
function focusDeepLink(host: Element, focus: unknown, cardId: string | undefined): void {
  if (focus === "card") {
    if (!cardId) return;
    const card = host.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
    if (card) focusElement(card);
    return;
  }
  if (focus === "activity") {
    const activity = document.querySelector<HTMLElement>('[data-island="activity-panel"]');
    if (activity) focusElement(activity, "start");
  }
}

/**
 * Boot the live board on mount: load the snapshot, connect the socket, seed state, wire the keepalive
 * + realtime subscription + the body-level preview overlay (all released via `ctx.cleanup`), then
 * honour any deep-link focus. Board id + focus come from the route context.
 *
 * @param ctx - The board component context.
 * @returns A promise that resolves once the board is loaded and wired.
 * @example
 * ```ts
 * createIsland("board", { onMount: startBoard });
 * ```
 */
export async function startBoard(ctx: BoardContext): Promise<void> {
  const boardId = ctx.params.id ?? "";
  const snapshot = await getBoard(boardId);
  connect(boardId);

  // Body-level overlay root so the preview escapes the board's scroll / overflow containers.
  // appendChild (not append): the DOM and @cloudflare/workers-types globals merge Element.append
  // into conflicting overloads, so use appendChild.
  const previewRoot = document.createElement("div");
  // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
  document.body.appendChild(previewRoot);

  ctx.set({
    boardId,
    snapshot,
    attachmentsByCard: groupAttachmentsByCard(snapshot.attachments),
    previewRoot
  });

  // Live patches reconcile state; keepalive holds the socket; the overlay handles its own clicks +
  // an Escape key. All released on destroy via ctx.cleanup.
  ctx.cleanup(onPatch(patch => applyPatch(ctx, patch)));
  const keepalive = globalThis.setInterval(() => ping(), KEEPALIVE_MS);
  ctx.cleanup(() => globalThis.clearInterval(keepalive));
  ctx.cleanup(() => disconnect());

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the overlay click handler
  const onRootClick = (event: Event): void => onPreviewClick(ctx, event);
  previewRoot.addEventListener("click", onRootClick);
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the overlay keydown handler
  const onKeydown = (event: KeyboardEvent): void => onPreviewKeydown(ctx, event);
  document.addEventListener("keydown", onKeydown);
  ctx.cleanup(() => {
    document.removeEventListener("keydown", onKeydown);
    previewRoot.remove();
  });

  // Flush the seeded render before measuring deep-link targets, then focus.
  ctx.flush();
  focusDeepLink(ctx.el, ctx.meta.focus, ctx.params.cardId);
}
