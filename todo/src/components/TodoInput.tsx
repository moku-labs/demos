/**
 * @file TodoInput — the one field that adds a todo. Uncontrolled on purpose: the island clears it
 * on submit, so a re-render triggered by a store or tray answer can never fight what is being
 * typed. The 16px font size is what keeps iOS Safari from zooming the page on focus.
 */
import type { JSX } from "preact";

/**
 * Render the new-todo form.
 *
 * @returns The form, submitted through the island's `[data-todo-form]` handler.
 * @example
 * ```tsx
 * <TodoInput />
 * ```
 */
export function TodoInput(): JSX.Element {
  return (
    <form data-component="todo-input" data-todo-form>
      <input
        data-todo-title
        type="text"
        name="title"
        placeholder="What needs doing?"
        aria-label="New todo"
        autoComplete="off"
        autoCorrect="off"
        enterkeyhint="done"
        maxLength={200}
      />
      <button type="submit" data-action="add">
        Add
      </button>
    </form>
  );
}
