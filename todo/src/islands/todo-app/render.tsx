/**
 * @file The todo island's view — a pure function of island state over the flat presentational
 * components. It renders what the state says, including what each capability last answered; the
 * runtime never appears in a condition here.
 */
import type { Spa } from "@moku-labs/web/browser";
import { Filters } from "../../components/Filters";
import { SystemPanel } from "../../components/SystemPanel";
import { TodoInput } from "../../components/TodoInput";
import { TodoList } from "../../components/TodoList";
import { countActive, filterTodos } from "../../lib/todos";
import type { TodoAppState } from "./types";

/** What the list area says when the active filter has nothing to show. */
const EMPTY_TEXT: Record<TodoAppState["filter"], string> = {
  all: "Nothing to do. Add the first todo above.",
  active: "Nothing left — every todo is done.",
  done: "Nothing done yet."
};

/**
 * Render the todo screen.
 *
 * @param state - The current island state.
 * @returns The screen.
 * @example
 * ```ts
 * createIsland("todo-app", { render });
 * ```
 */
export function render(state: Readonly<TodoAppState>): Spa.RenderResult {
  const visible = filterTodos(state.todos, state.filter);
  const activeCount = countActive(state.todos);

  return (
    <div data-todo-app data-ready={state.ready ? "" : undefined}>
      <header data-region="header">
        <h1>Moku Todo</h1>
        <p data-tagline>One codebase — the browser, macOS and iOS.</p>
      </header>

      <TodoInput />

      <Filters
        filter={state.filter}
        activeCount={activeCount}
        doneCount={state.todos.length - activeCount}
      />

      {state.notice.length > 0 ? (
        <p data-notice role="status">
          {state.notice}
        </p>
      ) : undefined}

      <TodoList todos={visible} emptyText={EMPTY_TEXT[state.filter]} />

      <SystemPanel
        rows={state.rows}
        kind={state.runtimeKind}
        platform={state.runtimePlatform}
        open={state.panelOpen}
      />
    </div>
  );
}
