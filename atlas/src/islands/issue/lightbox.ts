/**
 * @file Attachment lightbox — the full-screen image preview, made a deep-linkable URL state (#15). The
 * preview lives at `/board/{id}/issue/{issueId}/attachment/{attachmentId}`: opening it `replaceState`s
 * that URL (instant + shareable, with NO SPA re-mount, so the panel never blinks), and dismissing it
 * restores the issue URL. A fresh load of the attachment URL opens the issue and then this preview
 * straight away. The lightbox itself is a vanilla DOM node layered over everything (no Preact render).
 */
import { attachmentUrl } from "../../lib/api";
import { formatBytes, isInlineSafe } from "../../lib/attachments";
import { urls } from "../../routes";
import type { IssueContext } from "./types";

/** The single lightbox host flag — at most one preview is ever open. */
const LIGHTBOX_FLAG = "lightbox";

/**
 * Remove any open lightbox node + its key listener. Safe to call when none is open. Called on dismiss
 * AND whenever the panel closes/navigates away, so a body-level lightbox never outlives its issue.
 *
 * @example
 * ```ts
 * closeLightbox();
 * ```
 */
export function closeLightbox(): void {
  const existing = document.querySelector(`[data-${LIGHTBOX_FLAG}]`);
  if (existing instanceof HTMLElement) existing.dispatchEvent(new CustomEvent("lightbox:dismiss"));
}

/**
 * Show a full-screen lightbox preview for an image attachment. Dismissed by the backdrop, the × button,
 * or Escape — each runs `onDismiss` (used to restore the issue URL). Re-entrant: an already-open
 * lightbox is replaced.
 *
 * @param href - The attachment blob URL to preview.
 * @param filename - The attachment filename (shown as the caption).
 * @param size - The formatted byte count (shown as the caption).
 * @param onDismiss - Called once when the preview is dismissed (restores the issue URL).
 * @example
 * ```ts
 * showLightbox("/api/attachments/abc", "shot.png", "1.2 MB", () => restoreIssueUrl());
 * ```
 */
function showLightbox(href: string, filename: string, size: string, onDismiss: () => void): void {
  // Re-entrancy: drop any previous preview without running its restore (we are replacing it).
  const stale = document.querySelector(`[data-${LIGHTBOX_FLAG}]`);
  if (stale instanceof HTMLElement) stale.remove();

  const overlay = document.createElement("div");
  overlay.dataset[LIGHTBOX_FLAG] = "";

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

  let dismissed = false;
  /**
   * Dismiss the lightbox, detach its listeners, and run the restore callback (once).
   *
   * @example
   * ```ts
   * dismiss();
   * ```
   */
  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    onDismiss();
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
  // Programmatic close (panel navigated away) — restore is NOT wanted here, so bypass onDismiss.
  overlay.addEventListener("lightbox:dismiss", () => {
    dismissed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  });
  document.addEventListener("keydown", onKey);
}

/**
 * Open the deep-linkable preview for one of the open issue's attachments. Only image attachments are
 * previewable (others have no inline view). When `updateUrl` is true (a user click) the attachment URL
 * is pushed via `replaceState` so it is shareable; on a deep-link load it is already the URL. Dismiss
 * always restores the issue URL.
 *
 * @param ctx - The issue component context (its state carries the loaded detail + ids).
 * @param attachmentId - The attachment to preview.
 * @param options - Open options.
 * @param options.updateUrl - Set the shareable attachment URL (true for a click; false on deep-link load).
 * @example
 * ```ts
 * openAttachmentPreview(ctx, attachmentId, { updateUrl: true });
 * ```
 */
export function openAttachmentPreview(
  ctx: IssueContext,
  attachmentId: string,
  options: { updateUrl: boolean }
): void {
  const detail = ctx.state.detail;
  const { boardId, issueId } = ctx.state;
  if (!detail || !boardId || !issueId) return;

  const attachment = detail.attachments.find(att => att.id === attachmentId);
  // Only inline-safe images get the lightbox — mirror exactly what the worker serves inline.
  if (!attachment || !isInlineSafe(attachment.contentType, attachment.filename)) return;

  const issueHref = urls.toUrl("issue", { id: boardId, issueId });
  if (options.updateUrl) {
    const previewHref = urls.toUrl("attachment", { id: boardId, issueId, attachmentId });
    globalThis.history.replaceState(globalThis.history.state, "", previewHref);
  }

  showLightbox(
    attachmentUrl(attachment.id),
    attachment.filename,
    formatBytes(attachment.size),
    () => {
      globalThis.history.replaceState(globalThis.history.state, "", issueHref);
    }
  );
}
