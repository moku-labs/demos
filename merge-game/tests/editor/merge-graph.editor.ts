import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMergeGame } from "./helpers/merge-game";

// fixtures/merge-graph.json is the flow graph the editor's flowView layout tests run on: the
// flow.describe() of this game, kept in the editor repository so its CI runs without the game.
// This file keeps it honest against the demo's game.

describe("merge-graph fixture", () => {
  it("equals flow.describe() of the merge game", async () => {
    const { headless } = await loadMergeGame();
    const { app } = headless();
    const game = app as unknown as { start(): Promise<void>; flow: { describe(): unknown } };
    await game.start();
    const fixture: unknown = JSON.parse(
      readFileSync(new URL("fixtures/merge-graph.json", import.meta.url), "utf8")
    );
    expect(structuredClone(game.flow.describe())).toEqual(fixture);
  });
});
