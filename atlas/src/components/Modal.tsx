/**
 * @file Modal (modals E1/E2/E3) — one centered dialog with a dimmed backdrop, switched by `variant`
 * (design context §6 E1/E2/E3). `delete`: a danger confirm ("…This can't be undone.") with Cancel /
 * Delete. `prompt`: a "New …" single text field with Cancel / Create — used for Add column / board /
 * card. `date`: a "Set …" date field with Clear / Cancel / Save — used for the issue Due date. The
 * primary/danger action paints in the vermilion accent. Pure + SSR shared markup: the Phase-C island
 * re-renders it via `h(Modal, props)` and wires submit/dismiss off the `data-action`/`data-scrim`
 * hooks; the form degrades to a real submit with no JS.
 */
import { Icon } from "./Icon";

/** Props for {@link Modal}. */
export interface ModalProps {
  /** Which dialog to render. */
  variant: "delete" | "prompt" | "date";
  /** The dialog title (e.g. "Delete column", "New board", "Set due date"). */
  title: string;
  /** The body copy (delete variant) or helper line. */
  message?: string;
  /** Label for the primary/confirm button (defaults per variant). */
  confirmLabel?: string;
  /** Placeholder for the text field (prompt variant). */
  placeholder?: string;
}

/**
 * Render a centered modal for the given variant — delete confirm, add prompt, or date prompt.
 *
 * @param props - The modal props.
 * @param props.variant - Which dialog to render (`delete` | `prompt` | `date`).
 * @param props.title - The dialog title.
 * @param props.message - The body copy (delete) or helper line.
 * @param props.confirmLabel - Label for the primary/confirm button (defaults per variant).
 * @param props.placeholder - Placeholder for the text field (prompt variant).
 * @returns The modal element.
 * @example
 * ```tsx
 * <Modal variant="delete" title="Delete this column?" message="This can't be undone." />
 * <Modal variant="prompt" title="New board" placeholder="Board title" />
 * <Modal variant="date" title="Set due date" />
 * ```
 */
export function Modal({ variant, title, message, confirmLabel, placeholder }: ModalProps) {
  const isDelete = variant === "delete";
  const isDate = variant === "date";
  const confirm = confirmLabel ?? (isDelete ? "Delete" : isDate ? "Save" : "Create");

  return (
    <div data-modal data-variant={variant}>
      <div data-scrim data-action="dismiss-modal" aria-hidden="true" />
      <div data-dialog role="dialog" aria-modal="true" aria-label={title}>
        <form data-modal-form data-action="confirm-modal" method="dialog">
          <header data-modal-head>
            <h2 data-modal-title>{title}</h2>
            <button type="button" data-action="dismiss-modal" aria-label="Close">
              <Icon name="close" />
            </button>
          </header>

          {message && <p data-modal-message>{message}</p>}

          {variant === "prompt" && (
            <label data-modal-field>
              <input
                type="text"
                name="value"
                data-action="modal-input"
                placeholder={placeholder ?? "Title"}
                autocomplete="off"
                required
              />
            </label>
          )}

          {isDate && (
            <label data-modal-field>
              <input type="date" name="value" data-action="modal-input" />
            </label>
          )}

          <footer data-modal-actions>
            {isDate && (
              <button type="button" data-modal-btn data-tone="ghost" data-action="clear-date">
                Clear
              </button>
            )}
            <span data-modal-spacer />
            <button type="button" data-modal-btn data-tone="quiet" data-action="dismiss-modal">
              Cancel
            </button>
            <button
              type="submit"
              data-modal-btn
              data-tone={isDelete ? "danger" : "primary"}
              data-action="confirm-modal"
            >
              {confirm}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
