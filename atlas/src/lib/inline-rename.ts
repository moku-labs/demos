/**
 * @file Inline rename utility (design context §4 "Double-click to rename" + §6 D4).
 *
 * `inlineRename` swaps a title element for an `<input>` in the same spot — Enter saves, Escape
 * cancels, blur saves. This is the desktop path; the existing modal flow remains the mobile + menu
 * path. Returns a Promise that resolves to the trimmed new title (or undefined when cancelled /
 * unchanged).
 *
 * Pattern: the caller hides the original text, inserts the input adjacent to it, and cleans up on
 * settle. The input mirrors the title's computed font so the edit feels in-place.
 */

/**
 * Options for {@link inlineRename}.
 */
export interface InlineRenameOptions {
  /** The element whose text content is being renamed (hidden during edit). */
  titleEl: HTMLElement;
  /** The current value to seed the input with. */
  currentValue: string;
}

/**
 * Swap a title element for an in-place `<input>`, wait for Enter/Escape/blur, then restore.
 *
 * Desktop dblclick on any title triggers this. Enter or blur saves (returns the new title string);
 * Escape cancels (returns undefined). An unchanged submit also returns undefined.
 *
 * @param options - The inline rename options.
 * @param options.titleEl - The element to hide and replace with an input.
 * @param options.currentValue - The seed value for the input.
 * @returns The trimmed new title, or undefined when cancelled / unchanged.
 * @example
 * ```ts
 * const next = await inlineRename({ titleEl, currentValue: "Backlog" });
 * if (next) await renameColumn(id, next);
 * ```
 */
export function inlineRename({
  titleEl,
  currentValue
}: InlineRenameOptions): Promise<string | undefined> {
  return new Promise(resolve => {
    const computed = getComputedStyle(titleEl);

    // Hide the original text (visibility:hidden keeps it in flow — siblings don't shift).
    titleEl.dataset.renaming = "";

    // Build the input, mirroring the title's font so the swap feels seamless.
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentValue;
    input.dataset.inlineRename = "";

    // Apply a minimal matching style so the field reads as the title itself.
    // `flex: 1` lets it grow in flex-row column/pill headers; `display: block` handles block parents.
    Object.assign(input.style, {
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      letterSpacing: computed.letterSpacing,
      lineHeight: computed.lineHeight,
      textTransform: computed.textTransform,
      color: computed.color,
      background: "transparent",
      border: "none",
      borderBottom: "1px solid var(--accent)",
      borderRadius: "0",
      padding: "0",
      margin: "0",
      outline: "none",
      minWidth: "4rem",
      maxWidth: "100%",
      flex: "1",
      display: "block"
    });

    let settled = false;

    /**
     * Settle the rename — tears down listeners, removes the input, restores the title, resolves.
     *
     * @param value - The accepted value, or undefined to cancel.
     * @example
     * ```ts
     * settle(input.value); // save
     * settle();            // cancel
     * ```
     */
    function settle(value?: string): void {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      input.remove();
      delete titleEl.dataset.renaming;
      const trimmed = value?.trim();
      resolve(trimmed && trimmed !== currentValue ? trimmed : undefined);
    }

    /**
     * Commit on Enter, cancel on Escape. Bound at the document (capture) so it fires even if a focus
     * race leaves the input un-focused — Escape must always be able to cancel the edit.
     *
     * @param event - The keyboard event.
     * @example
     * ```ts
     * document.addEventListener("keydown", onKeydown, true);
     * ```
     */
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Enter") {
        event.preventDefault();
        settle(input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        settle();
      }
    }

    document.addEventListener("keydown", onKeydown, true);
    // Blur saves (clicking elsewhere commits the edit).
    input.addEventListener("blur", () => settle(input.value));

    // insertBefore (not `.after`): @cloudflare/workers-types merges Element.after into a conflicting
    // overload set in this project (see nav.ts `appendChild` note), so the DOM helper is used explicitly.
    titleEl.parentNode?.insertBefore(input, titleEl.nextSibling);

    // Focus synchronously so the field is editable immediately; select-all on the next frame (after
    // layout) so the seed text is highlighted for instant overwrite.
    input.focus();
    requestAnimationFrame(() => input.select());
  });
}
