/**
 * @file TodoItem — one row: a toggle, the title, a reminder, a delete. Each control carries the
 * todo's `data-id`, which is all the island's delegated handlers need to act on the right entry.
 */
import type { JSX } from "preact";
import type { TodoItemProps } from "./types";

/**
 * Render one todo row.
 *
 * @param props - The item props.
 * @param props.todo - The todo to render.
 * @returns The list row.
 * @example
 * ```tsx
 * <TodoItem todo={todo} />
 * ```
 */
export function TodoItem({ todo }: TodoItemProps): JSX.Element {
  return (
    <li data-component="todo-item" data-id={todo.id} data-done={todo.done ? "" : undefined}>
      <button
        type="button"
        data-action="toggle"
        data-id={todo.id}
        aria-pressed={todo.done}
        aria-label={todo.done ? `Mark "${todo.title}" as active` : `Mark "${todo.title}" as done`}
      >
        <span data-box aria-hidden="true">
          {todo.done ? "✓" : ""}
        </span>
        <span data-title>{todo.title}</span>
      </button>
      <button
        type="button"
        data-action="remind"
        data-id={todo.id}
        aria-label={`Remind me about "${todo.title}"`}
      >
        Remind
      </button>
      <button
        type="button"
        data-action="remove"
        data-id={todo.id}
        aria-label={`Delete "${todo.title}"`}
      >
        Delete
      </button>
    </li>
  );
}
