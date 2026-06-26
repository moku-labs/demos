/**
 * @file DismissButton — the small ghost pill that closes a banner or toast (§G; used by the
 * disconnect banner D1 and the category-exhausted toast D2). Translucent, brightens on hover.
 */
import type { DismissButtonProps } from "./types";

/**
 * Render the small "Dismiss" ghost pill used to close transient overlays.
 *
 * Presentational: the parent owns what dismissing means and passes `onClick`. The label defaults to
 * "Dismiss" but can be overridden.
 *
 * @param props - The dismiss-button props.
 * @param props.label - Optional button text (defaults to "Dismiss").
 * @param props.onClick - Called when the button is tapped.
 * @returns The dismiss-button element.
 * @example
 * ```tsx
 * <DismissButton onClick={close} />
 * <DismissButton label="Got it" onClick={close} />
 * ```
 */
export function DismissButton({ label, onClick }: DismissButtonProps) {
  return (
    <button type="button" data-component="dismiss-button" onClick={onClick}>
      {label ?? "Dismiss"}
    </button>
  );
}
