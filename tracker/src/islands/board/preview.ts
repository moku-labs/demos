/**
 * @file board island — the attachment preview overlay. A body-level dialog (escapes the board's
 * scroll/overflow containers), rendered with a direct Preact `render` — the documented off-host
 * escape hatch — and closed on Escape, the × control, or a backdrop click.
 */
import { h, render as preactRender } from "preact";
import { AttachmentPreview } from "../../components/AttachmentPreview";
import type { Attachment } from "../../lib/types";
import type { BoardContext } from "./types";

/**
 * Close the attachment preview overlay: unmount it and clear the open marker.
 *
 * @param ctx - The board component context.
 * @example
 * ```ts
 * closePreview(ctx);
 * ```
 */
export function closePreview(ctx: BoardContext): void {
  const { previewRoot } = ctx.state;
  // eslint-disable-next-line unicorn/no-null -- Preact unmounts a container when rendered with null
  if (previewRoot) preactRender(null, previewRoot);
  ctx.set({ preview: undefined });
}

/**
 * Open the attachment preview overlay for one attachment: render it into the body-level root and
 * focus the close control.
 *
 * @param ctx - The board component context.
 * @param attachment - The attachment to preview.
 * @example
 * ```ts
 * openPreview(ctx, attachment);
 * ```
 */
export function openPreview(ctx: BoardContext, attachment: Attachment): void {
  const { previewRoot } = ctx.state;
  if (!previewRoot) return;
  preactRender(h(AttachmentPreview, { attachment }), previewRoot);
  ctx.set({ preview: attachment });
  previewRoot.querySelector<HTMLElement>("[data-preview-close]")?.focus();
}

/**
 * Close the open preview on Escape (the board-level document key handler).
 *
 * @param ctx - The board component context.
 * @param event - The keydown event.
 * @example
 * ```ts
 * document.addEventListener("keydown", event => onPreviewKeydown(ctx, event));
 * ```
 */
export function onPreviewKeydown(ctx: BoardContext, event: KeyboardEvent): void {
  if (event.key === "Escape" && ctx.state.preview) closePreview(ctx);
}

/**
 * Handle a click on the preview overlay root: close on the × button or a backdrop click.
 *
 * @param ctx - The board component context.
 * @param event - The click event.
 * @example
 * ```ts
 * previewRoot.addEventListener("click", event => onPreviewClick(ctx, event));
 * ```
 */
export function onPreviewClick(ctx: BoardContext, event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-preview-close]") || target.matches("[data-preview-backdrop]")) {
    closePreview(ctx);
  }
}
