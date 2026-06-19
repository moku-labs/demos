/**
 * @file board-list island — the home-page controller. Mounts on `[data-component="board-list"]`,
 * seeds it from `listBoards`, and delegates the create-board form submit to `createBoard` before
 * navigating to the new board. Coordinates with the worker purely through `lib/api`.
 */
import { createComponent } from "@moku-labs/web/browser";
import { h, render } from "preact";
import { BoardList } from "../components/BoardList";
import { createBoard, listBoards } from "../lib/api";

/**
 * Handle a delegated create-board submit: create the board, then navigate to it.
 *
 * @param event - The delegated submit event.
 * @example
 * ```ts
 * host.addEventListener("submit", onCreateBoard);
 * ```
 */
async function onCreateBoard(event: Event): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const form = target.closest("[data-create-board]");
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  const input = form.querySelector<HTMLInputElement>("[data-create-board-input]");
  const title = input?.value.trim();
  if (!title) return;

  const board = await createBoard({ title });
  globalThis.location.assign(`/b/${board.id}`);
}

/**
 * Render the live board list into the home-page mount point and wire the create-board form.
 *
 * @param host - The `[data-component="board-list"]` element to fill.
 * @example
 * ```ts
 * await mountBoardList(element);
 * ```
 */
async function mountBoardList(host: Element): Promise<void> {
  const boards = await listBoards();
  render(h(BoardList, { boards }), host);
  host.addEventListener("submit", onCreateBoard);
}

/** Home-page island: lists boards and creates new ones. */
export const boardList = createComponent("board-list", {
  /**
   * Render the live board list and wire the create form on mount.
   *
   * @param ctx - The component context (its `el` is the board-list mount point).
   * @example
   * ```ts
   * createComponent("board-list", { onMount });
   * ```
   */
  onMount(ctx) {
    void mountBoardList(ctx.el);
  }
});
