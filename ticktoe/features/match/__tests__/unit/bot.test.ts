/**
 * @file The bot, level by level, with the draw of every move written out.
 */
import { tables } from "@core/tables";
import type { Board, Level, Mark } from "@core/types";
import { describe, expect, it } from "vitest";
import { bestMoves, botMove, emptyCells, resultOf, unpackDraw } from "../../rules";

const bot = tables.bot;

/** The highest pick a draw of 0..999_999 can carry. */
const TOP_PICK = 33;

/** Builds the draw that unpacks to this roll and this pick. */
function drawOf(roll: number, pick: number, pause = 0): number {
  return pause + bot.pauseSpreadMs * (roll + 100 * pick);
}

/** Every roll that matters: both ends and both sides of the two thresholds. */
const rolls = [
  0,
  bot.easyAsNormalPct - 1,
  bot.easyAsNormalPct,
  bot.normalHeuristicPct - 1,
  bot.normalHeuristicPct,
  99
];

const empty: Board = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The board after one more mark, as a copy. */
function placed(board: Board, cell: number, mark: Mark): Board {
  const next = [...board];

  next[cell] = mark;

  return next;
}

/**
 * Plays every line the human can choose against the bot and counts how the rounds end.
 */
function playEveryLine(
  board: Board,
  turn: Mark,
  level: Level,
  draw: number,
  counts: Record<string, number>
): void {
  const result = resultOf(board);

  if (result !== "none") {
    counts[result] = (counts[result] ?? 0) + 1;

    return;
  }

  if (turn === 2) {
    playEveryLine(placed(board, botMove(board, 2, level, draw, bot), 2), 1, level, draw, counts);

    return;
  }

  for (const cell of emptyCells(board)) {
    playEveryLine(placed(board, cell, 1), 2, level, draw, counts);
  }
}

describe("drawOf", () => {
  it("builds draws inside the range the node draws from", () => {
    expect(drawOf(99, TOP_PICK - 1, 300)).toBeLessThan(1_000_000);
    expect(unpackDraw(drawOf(42, 7, 15), bot)).toEqual({ pauseMs: 415, roll: 42, pick: 7 });
  });
});

describe("bestMoves", () => {
  it("lists every cell of an empty board: each of them holds the draw", () => {
    expect(bestMoves(empty, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("answers the centre to a corner, the only move that does not lose", () => {
    expect(bestMoves([1, 0, 0, 0, 0, 0, 0, 0, 0], 2)).toEqual([4]);
  });

  it("answers a corner to the centre", () => {
    expect(bestMoves([0, 0, 0, 0, 1, 0, 0, 0, 0], 2)).toEqual([0, 2, 6, 8]);
  });

  it("takes the win that is there now, not a slower one", () => {
    const board: Board = [2, 2, 0, 1, 1, 0, 0, 0, 0];

    expect(bestMoves(board, 2)).toEqual([2]);
  });

  it("blocks the only line that loses now", () => {
    const board: Board = [1, 1, 0, 0, 2, 0, 0, 0, 0];

    expect(bestMoves(board, 2)).toEqual([2]);
  });

  it("holds out as long as it can in a lost position", () => {
    const board: Board = [1, 2, 0, 0, 1, 0, 0, 0, 0];

    expect(bestMoves(board, 2)).toEqual([8]);
  });

  it("lists every move when all of them lose equally fast", () => {
    const board: Board = [1, 0, 1, 0, 1, 0, 2, 0, 0];

    expect(bestMoves(board, 2)).toEqual([1, 3, 5, 7, 8]);
  });

  it("lists nothing on a full board", () => {
    expect(bestMoves([1, 1, 2, 2, 2, 1, 1, 2, 1], 2)).toEqual([]);
  });

  it("leaves the board it was given as it was", () => {
    const board: Board = [1, 0, 0, 0, 2, 0, 0, 0, 0];

    bestMoves(board, 1);

    expect(board).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0]);
  });
});

describe("botMove, hard", () => {
  it("picks among the best moves by the pick of the draw", () => {
    const board: Board = [0, 0, 0, 0, 1, 0, 0, 0, 0];

    expect(botMove(board, 2, "hard", drawOf(0, 0), bot)).toBe(0);
    expect(botMove(board, 2, "hard", drawOf(0, 1), bot)).toBe(2);
    expect(botMove(board, 2, "hard", drawOf(0, 2), bot)).toBe(6);
    expect(botMove(board, 2, "hard", drawOf(0, 3), bot)).toBe(8);
    expect(botMove(board, 2, "hard", drawOf(0, 4), bot)).toBe(0);
  });

  it("ignores the roll", () => {
    const board: Board = [1, 0, 0, 0, 0, 0, 0, 0, 0];

    for (const roll of rolls) expect(botMove(board, 2, "hard", drawOf(roll, 5), bot)).toBe(4);
  });

  it.each([
    ["the human", 1 as Mark, 0],
    ["the human", 1 as Mark, TOP_PICK],
    ["the bot", 2 as Mark, 0],
    ["the bot", 2 as Mark, TOP_PICK]
  ])("never loses when %s moves first, pick %i", (_who, first, pick) => {
    const counts: Record<string, number> = {};

    playEveryLine(empty, first, "hard", drawOf(0, pick), counts);

    expect(counts.win ?? 0).toBe(0);
    expect((counts.loss ?? 0) + (counts.draw ?? 0)).toBeGreaterThan(0);
  });

  it("never loses for any pick a draw can carry", { timeout: 60_000 }, () => {
    for (let pick = 0; pick <= TOP_PICK; pick += 1) {
      const counts: Record<string, number> = {};

      playEveryLine(empty, 1, "hard", drawOf(50, pick), counts);
      playEveryLine(empty, 2, "hard", drawOf(50, pick), counts);

      expect(counts.win ?? 0).toBe(0);
    }
  });
});

describe("botMove, normal", () => {
  it("takes a win at every roll and every pick", () => {
    const board: Board = [2, 2, 0, 1, 1, 0, 0, 0, 0];

    for (const roll of rolls) {
      for (const pick of [0, 1, 2, TOP_PICK - 1]) {
        expect(botMove(board, 2, "normal", drawOf(roll, pick), bot)).toBe(2);
      }
    }
  });

  it("takes the lowest of two wins", () => {
    const board: Board = [2, 2, 0, 2, 1, 1, 0, 1, 0];

    expect(botMove(board, 2, "normal", drawOf(99, 3), bot)).toBe(2);
  });

  it("blocks a loss at every roll and every pick", () => {
    const board: Board = [1, 1, 0, 0, 2, 0, 0, 0, 0];

    for (const roll of rolls) {
      for (const pick of [0, 1, 2, TOP_PICK - 1]) {
        expect(botMove(board, 2, "normal", drawOf(roll, pick), bot)).toBe(2);
      }
    }
  });

  it("wins before it blocks", () => {
    const board: Board = [1, 1, 0, 2, 2, 0, 0, 0, 0];

    expect(botMove(board, 2, "normal", drawOf(0, 0), bot)).toBe(5);
  });

  it("takes the centre when the roll is under the heuristic share", () => {
    const board: Board = [1, 0, 0, 0, 0, 0, 0, 0, 0];

    for (const pick of [0, 1, 5]) {
      expect(botMove(board, 2, "normal", drawOf(bot.normalHeuristicPct - 1, pick), bot)).toBe(4);
    }
  });

  it("takes a corner by the pick when the centre is taken", () => {
    const board: Board = [0, 0, 0, 0, 1, 0, 0, 0, 0];

    expect(botMove(board, 2, "normal", drawOf(0, 0), bot)).toBe(0);
    expect(botMove(board, 2, "normal", drawOf(0, 1), bot)).toBe(2);
    expect(botMove(board, 2, "normal", drawOf(0, 2), bot)).toBe(6);
    expect(botMove(board, 2, "normal", drawOf(0, 3), bot)).toBe(8);
    expect(botMove(board, 2, "normal", drawOf(0, 4), bot)).toBe(0);
  });

  it("takes an edge by the pick when the centre and the corners are taken", () => {
    const board: Board = [1, 2, 1, 0, 1, 0, 2, 1, 2];

    expect(resultOf(board)).toBe("none");
    expect(botMove(board, 2, "normal", drawOf(0, 0), bot)).toBe(3);
    expect(botMove(board, 2, "normal", drawOf(0, 1), bot)).toBe(5);
    expect(botMove(board, 2, "normal", drawOf(0, 2), bot)).toBe(3);
  });

  it("follows the pick over every free cell when the roll is at or over the share", () => {
    const board: Board = [1, 0, 0, 0, 0, 0, 0, 0, 0];
    const free = emptyCells(board);

    for (const roll of [bot.normalHeuristicPct, 99]) {
      for (let pick = 0; pick < 10; pick += 1) {
        expect(botMove(board, 2, "normal", drawOf(roll, pick), bot)).toBe(free[pick % free.length]);
      }
    }
  });

  it("loses the scripted fork: human 0, bot 4, human 8, bot a corner, human the other corner", () => {
    const heuristic = drawOf(0, 0);
    let board: Board = placed(empty, 0, 1);

    expect(botMove(board, 2, "normal", heuristic, bot)).toBe(4);
    board = placed(placed(board, 4, 2), 8, 1);

    const corner = botMove(board, 2, "normal", heuristic, bot);

    expect(corner).toBe(2);
    board = placed(placed(board, corner, 2), 6, 1);

    const block = botMove(board, 2, "normal", heuristic, bot);

    expect([3, 7]).toContain(block);
    board = placed(board, block, 2);
    board = placed(board, block === 3 ? 7 : 3, 1);

    expect(resultOf(board)).toBe("win");
  });

  it("loses the same fork from the other corner", () => {
    const other = drawOf(0, 1);
    let board: Board = placed(placed(placed(empty, 0, 1), 4, 2), 8, 1);

    expect(botMove(board, 2, "normal", other, bot)).toBe(6);
    board = placed(placed(board, 6, 2), 2, 1);

    const block = botMove(board, 2, "normal", other, bot);

    expect([1, 5]).toContain(block);
    board = placed(placed(board, block, 2), block === 1 ? 5 : 1, 1);

    expect(resultOf(board)).toBe("win");
  });
});

describe("botMove, easy", () => {
  it("follows the pick over every free cell when the roll is at or over its share", () => {
    const board: Board = [2, 2, 0, 1, 1, 0, 0, 0, 0];
    const free = emptyCells(board);

    for (const roll of [bot.easyAsNormalPct, 50, 99]) {
      for (let pick = 0; pick < 10; pick += 1) {
        expect(botMove(board, 2, "easy", drawOf(roll, pick), bot)).toBe(free[pick % free.length]);
      }
    }
  });

  it("misses a win and a block then", () => {
    const board: Board = [2, 2, 0, 1, 1, 0, 0, 0, 0];

    expect(botMove(board, 2, "easy", drawOf(bot.easyAsNormalPct, 2), bot)).toBe(6);
  });

  it("plays as normal when the roll is under its share: it wins, it blocks, it takes the centre", () => {
    for (const roll of [0, bot.easyAsNormalPct - 1]) {
      expect(botMove([2, 2, 0, 1, 1, 0, 0, 0, 0], 2, "easy", drawOf(roll, 4), bot)).toBe(2);
      expect(botMove([1, 1, 0, 0, 2, 0, 0, 0, 0], 2, "easy", drawOf(roll, 4), bot)).toBe(2);
      expect(botMove([1, 0, 0, 0, 0, 0, 0, 0, 0], 2, "easy", drawOf(roll, 4), bot)).toBe(4);
    }
  });
});

describe("botMove, every level", () => {
  it("never names a taken cell, whatever the board and the draw", { timeout: 60_000 }, () => {
    const levels: Level[] = ["easy", "normal", "hard"];
    let state = 12_345;
    const next = (bound: number): number => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

      return state % bound;
    };

    for (let round = 0; round < 3000; round += 1) {
      let board: Board = [...empty];
      let turn: Mark = round % 2 === 0 ? 1 : 2;

      while (resultOf(board) === "none") {
        const level = levels[round % 3] ?? "easy";
        const cell = botMove(board, turn, level, next(1_000_000), bot);

        expect(board[cell]).toBe(0);
        board = placed(board, cell, turn);
        turn = turn === 1 ? 2 : 1;
      }
    }
  });

  it("answers -1 on a full board: there is no cell to name", () => {
    const full: Board = [1, 1, 2, 2, 2, 1, 1, 2, 1];

    for (const level of ["easy", "normal", "hard"] as const) {
      expect(botMove(full, 2, level, drawOf(10, 3), bot)).toBe(-1);
    }
  });

  it("plays the human's mark as well as its own", () => {
    expect(botMove([1, 1, 0, 2, 2, 0, 0, 0, 0], 1, "normal", drawOf(0, 0), bot)).toBe(2);
    expect(botMove([1, 1, 0, 2, 2, 0, 0, 0, 0], 1, "hard", drawOf(0, 0), bot)).toBe(2);
  });
});
