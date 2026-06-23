/**
 * @file Board scroll lock — keeps the persistent board visually STILL while an issue overlay is open.
 *
 * The board lives in the persistent chrome (never unmounted by navigation). But opening an issue is a
 * real SPA navigation, and the framework scrolls the window to the top as part of the swap. The issue
 * panel is a fixed overlay over a *semi-transparent* scrim, so the board behind it stays visible — which
 * means that scroll-to-top is SEEN as the board lurching to its top, and the close restore (which only
 * runs once the view transition settles, a beat later) snaps it back. Remembering-then-restoring fixes
 * the final position but not the visible motion in between.
 *
 * So instead we FREEZE the board: on open we pin `<body>` at its current scroll with
 * `position: fixed; top: -scrollY` (the proven, iOS-safe scroll lock). The framework's scroll-to-0 then
 * has no visual effect — the board stays exactly where it was — and the view-transition snapshot of the
 * board is identical before and after, so there is no crossfade flash either. On close we release the
 * pin and restore the scroll in the SAME synchronous turn, so the board never visibly moves at all.
 */

/** The window scrollY captured when the lock engaged (restored on release). */
let savedScrollY = 0;
/** Whether the body is currently pinned — makes lock/unlock idempotent (open path locks twice). */
let locked = false;

/**
 * Pin the document at its current scroll so the board cannot move while an issue overlay is open. Call
 * synchronously BEFORE the opening navigation, so the body is already fixed when the framework scrolls
 * the window to 0 (making that scroll a visual no-op). Idempotent — a second call while locked is a
 * no-op, preserving the originally-captured scroll.
 *
 * @example
 * ```ts
 * lockBoardScroll();
 * navigate(urls.toUrl("issue", { id, issueId }));
 * ```
 */
export function lockBoardScroll(): void {
  if (locked) return;
  savedScrollY = globalThis.scrollY;
  const { style } = document.body;
  style.position = "fixed";
  style.top = `-${savedScrollY}px`;
  style.left = "0";
  style.right = "0";
  style.width = "100%";
  locked = true;
}

/**
 * Release the pin and restore the exact scroll the board had before it was locked. Clearing the styles
 * and re-scrolling happen in one synchronous turn (no paint between), so the board lands back in place
 * without a flash. Idempotent — a no-op when not locked.
 *
 * @example
 * ```ts
 * unlockBoardScroll();
 * ```
 */
export function unlockBoardScroll(): void {
  if (!locked) return;
  locked = false;
  const { style } = document.body;
  style.position = "";
  style.top = "";
  style.left = "";
  style.right = "";
  style.width = "";
  // Restore in the SAME turn as clearing the pin so the browser never paints the unpinned-at-0 frame.
  globalThis.scrollTo({ top: savedScrollY, behavior: "instant" });
}

/**
 * Whether the board scroll is currently pinned. Exposed for assertions/tests (the lock is otherwise
 * an internal effect).
 *
 * @returns True while the body is pinned by {@link lockBoardScroll}.
 * @example
 * ```ts
 * expect(isBoardScrollLocked()).toBe(false);
 * ```
 */
export function isBoardScrollLocked(): boolean {
  return locked;
}
