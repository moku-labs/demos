/**
 * @file TodoList — the visible todos, or the empty state that takes their place. The empty text is
 * passed in so the same component covers "nothing yet" and "nothing in this filter".
 */
import type { JSX } from "preact";
import { TodoItem } from "./TodoItem";
import type { TodoListProps } from "./types";

/**
 * Render the list of todos.
 *
 * @param props - The list props.
 * @param props.todos - The todos the active filter shows.
 * @param props.emptyText - What to say when the list is empty.
 * @returns The list, or the empty state.
 * @example
 * ```tsx
 * <TodoList todos={visible} emptyText="Nothing here yet." />
 * ```
 */
export function TodoList({ todos, emptyText }: TodoListProps): JSX.Element {
  if (todos.length === 0) {
    return (
      <div data-component="todo-list" data-empty>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <ul data-component="todo-list">
      {todos.map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
