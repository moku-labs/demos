/**
 * @file What the nodes of a round share, called on its own: how a round is cleared, which answer
 * names a cell, and what shakes its head for a tap that cannot be taken. The nodes themselves are
 * walked in `isolated/round.isolated.ts`.
 */
import type { Session } from "@core/state";
import { startingSession } from "@core/state";
import type { Board } from "@core/types";
import { describe, expect, it } from "vitest";
import { clearRound } from "../../flow/round-state";
import { shakeTarget } from "../../names";
import { CELLS, isCell, NO_CELL, tappedCell } from "../../rules";

// oxlint-disable-next-line unicorn/no-null -- the runner hands an answer without a payload on as null
const NO_PAYLOAD = null;

describe("the helpers of a round", () => {
  it("clearRound hands every round a board of its own: nine free cells", () => {
    const first: Session = { ...startingSession };
    const second: Session = { ...startingSession };

    clearRound(first);
    clearRound(second);

    expect(CELLS).toBe(9);
    expect(first.board).toEqual(startingSession.board);
    expect(first.board).toHaveLength(CELLS);
    // A draft that shared one array with another round would write into both.
    expect(first.board).not.toBe(second.board);
    expect(first.board).not.toBe(startingSession.board);
  });

  it("isCell takes the whole numbers 0 to 8 and nothing else", () => {
    expect([0, 4, 8].every(cell => isCell(cell))).toBe(true);

    for (const cell of [-1, 9, 1.5, Number.NaN, "4", undefined, {}, [4]]) {
      expect(isCell(cell)).toBe(false);
    }
  });

  it("tappedCell reads the cell a tap names, and -1 for a tap that names none", () => {
    expect(NO_CELL).toBe(-1);
    expect([0, 4, 8].map(cell => tappedCell({ cell }))).toEqual([0, 4, 8]);
    expect(tappedCell({ cell: 4, extra: true })).toBe(4);

    const nameless = [NO_PAYLOAD, undefined, {}, "tile4", 4, [4], { cell: 9 }, { cell: "4" }];

    for (const answer of nameless) {
      expect(tappedCell(answer)).toBe(NO_CELL);
    }
  });

  it("shakeTarget is the piece of a taken cell, the tile of an empty one, nothing for no cell", () => {
    const board: Board = [1, 0, 0, 0, 2, 0, 0, 0, 0];

    expect(shakeTarget(board, 0)).toEqual({ projection: "match.pieces", key: "piece0" });
    expect(shakeTarget(board, 4)).toEqual({ projection: "match.pieces", key: "piece4" });
    expect(shakeTarget(board, 1)).toEqual({ projection: "match.tray", key: "tile1" });
    expect(shakeTarget(board, -1)).toBeUndefined();
    expect(shakeTarget(board, undefined)).toBeUndefined();
  });
});
