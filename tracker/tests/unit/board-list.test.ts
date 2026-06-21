// @vitest-environment happy-dom
/**
 * @file Full unit tests for the board-list island (home page) via `@moku-labs/web/testing`.
 * lib/api is mocked; navigation (location.assign) is spied.
 */

import { mountIsland } from "@moku-labs/web/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardList } from "../../src/islands/board-list";
import type { BoardSummary } from "../../src/lib/types";

vi.mock("../../src/lib/api", () => ({ listBoards: vi.fn(), createBoard: vi.fn() }));

import * as api from "../../src/lib/api";

const summary = (id: string, title: string, cardCount = 0): BoardSummary => ({
  id,
  title,
  cardCount,
  updatedAt: 0
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("board-list island", () => {
  it("renders the loaded boards", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([
      summary("1", "Alpha", 3),
      summary("2", "Beta", 1)
    ]);
    const handle = mountIsland<{ boards: BoardSummary[] }>(boardList);
    await handle.settle();

    const names = [...handle.el.querySelectorAll("[data-board-name]")].map(n => n.textContent);
    expect(names).toEqual(["Alpha", "Beta"]);
    expect(handle.state?.boards).toHaveLength(2);
  });

  it("renders an empty list with no boards", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([]);
    const handle = mountIsland(boardList);
    await handle.settle();
    expect(handle.el.querySelectorAll("[data-board-summary]")).toHaveLength(0);
    // The create form is still present (always rendered).
    expect(handle.el.querySelector("[data-create-board]")).not.toBeNull();
  });

  it("creates a board on submit and navigates to it", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([]);
    vi.mocked(api.createBoard).mockResolvedValue({ id: "99", title: "New", createdAt: 0 });
    const assign = vi.spyOn(globalThis.location, "assign").mockImplementation(() => {});
    const handle = mountIsland(boardList);
    await handle.settle();

    const input = handle.el.querySelector<HTMLInputElement>("[data-create-board-input]");
    if (input) input.value = "New board";
    handle.fire("submit [data-create-board]");
    await handle.settle();

    expect(api.createBoard).toHaveBeenCalledWith({ title: "New board" });
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("99"));
  });

  it("ignores a submit with an empty title", async () => {
    vi.mocked(api.listBoards).mockResolvedValue([]);
    const handle = mountIsland(boardList);
    await handle.settle();
    handle.fire("submit [data-create-board]"); // input left blank
    await handle.settle();
    expect(api.createBoard).not.toHaveBeenCalled();
  });
});
