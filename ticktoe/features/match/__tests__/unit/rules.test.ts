/**
 * @file The board rules: the winning lines, the winner, the free cells, the result, who moved
 * last, and the split of one bot draw.
 */
import { tables } from "@core/tables";
import type { Board } from "@core/types";
import { describe, expect, it } from "vitest";
import { emptyCells, LINES, lastMover, resultOf, unpackDraw, winnerOf } from "../../rules";
import { hasLine } from "../../rules/lines";

/** A board with one mark on the three cells of a line. */
function boardWith(line: readonly number[], mark: 1 | 2): Board {
  const board: Board = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (const cell of line) board[cell] = mark;

  return board;
}

/** A full board nobody won: X X O / O O X / X O X. */
const drawn: Board = [1, 1, 2, 2, 2, 1, 1, 2, 1];

describe("LINES", () => {
  it("lists the eight winning lines: three rows, three columns, two diagonals", () => {
    expect(LINES).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6]
    ]);
  });
});

describe("winnerOf", () => {
  it.each(LINES.map(line => [line]))("finds the human on the line %j", line => {
    expect(winnerOf(boardWith(line, 1))).toEqual({ mark: 1, line: [...line] });
  });

  it.each(LINES.map(line => [line]))("finds the bot on the line %j", line => {
    expect(winnerOf(boardWith(line, 2))).toEqual({ mark: 2, line: [...line] });
  });

  it("answers the mark 0 and an empty line on an empty board", () => {
    expect(winnerOf([0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ mark: 0, line: [] });
  });

  it("answers the mark 0 on a full board nobody won", () => {
    expect(winnerOf(drawn)).toEqual({ mark: 0, line: [] });
  });

  it("does not take two marks and a gap for a line", () => {
    expect(winnerOf([1, 1, 0, 2, 2, 0, 0, 0, 0]).mark).toBe(0);
  });

  it("hands out a copy of the line, never the table row", () => {
    const { line } = winnerOf(boardWith([0, 1, 2], 1));

    line.push(9);

    expect(LINES[0]).toEqual([0, 1, 2]);
  });
});

describe("hasLine", () => {
  it.each(LINES.map(line => [line]))("sees the line %j of the mark that holds it", line => {
    expect(hasLine(boardWith(line, 2), 2)).toBe(true);
    expect(hasLine(boardWith(line, 2), 1)).toBe(false);
  });

  it("sees no line on an empty board and on a full board nobody won", () => {
    expect(hasLine([0, 0, 0, 0, 0, 0, 0, 0, 0], 1)).toBe(false);
    expect(hasLine(drawn, 1)).toBe(false);
    expect(hasLine(drawn, 2)).toBe(false);
  });
});

describe("emptyCells", () => {
  it("lists the free cells in ascending order", () => {
    expect(emptyCells([1, 0, 2, 0, 0, 1, 2, 0, 0])).toEqual([1, 3, 4, 7, 8]);
  });

  it("lists all nine on an empty board and none on a full one", () => {
    expect(emptyCells([0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(emptyCells(drawn)).toEqual([]);
  });
});

describe("resultOf", () => {
  it("is none while cells are free and nobody has a line", () => {
    expect(resultOf([1, 2, 0, 0, 1, 0, 0, 0, 0])).toBe("none");
  });

  it("is a win when the human has a line", () => {
    expect(resultOf([1, 2, 2, 0, 1, 0, 0, 0, 1])).toBe("win");
  });

  it("is a loss when the bot has a line", () => {
    expect(resultOf([1, 1, 2, 0, 1, 2, 0, 0, 2])).toBe("loss");
  });

  it("is a draw on a full board nobody won", () => {
    expect(resultOf(drawn)).toBe("draw");
  });

  it("is a win, not a draw, when the last cell completes a line", () => {
    expect(resultOf([1, 2, 1, 2, 1, 2, 2, 1, 1])).toBe("win");
  });
});

describe("lastMover", () => {
  it("is the player whose turn it is not: a move hands the turn on", () => {
    expect(lastMover(2)).toBe(1);
    expect(lastMover(1)).toBe(2);
  });
});

describe("unpackDraw", () => {
  const bot = tables.bot;

  it("splits a draw into the pause, the roll and the pick", () => {
    expect(unpackDraw(0, bot)).toEqual({ pauseMs: 400, roll: 0, pick: 0 });
    expect(unpackDraw(300, bot)).toEqual({ pauseMs: 700, roll: 0, pick: 0 });
    expect(unpackDraw(301, bot)).toEqual({ pauseMs: 400, roll: 1, pick: 0 });
    expect(unpackDraw(301 * 100, bot)).toEqual({ pauseMs: 400, roll: 0, pick: 1 });
    expect(unpackDraw(123 + 301 * (45 + 100 * 6), bot)).toEqual({
      pauseMs: 523,
      roll: 45,
      pick: 6
    });
  });

  it("keeps the pause in 400..700 and the roll in 0..99 for every draw", () => {
    let pause = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    let roll = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    let pick = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };

    for (let draw = 0; draw < 1_000_000; draw += 1) {
      const parts = unpackDraw(draw, bot);

      pause = { min: Math.min(pause.min, parts.pauseMs), max: Math.max(pause.max, parts.pauseMs) };
      roll = { min: Math.min(roll.min, parts.roll), max: Math.max(roll.max, parts.roll) };
      pick = { min: Math.min(pick.min, parts.pick), max: Math.max(pick.max, parts.pick) };
    }

    expect(pause).toEqual({ min: 400, max: 700 });
    expect(roll).toEqual({ min: 0, max: 99 });
    expect(pick).toEqual({ min: 0, max: 33 });
  });

  it("only hands out whole numbers", () => {
    for (const draw of [0, 1, 299, 300, 301, 30_099, 30_100, 555_555, 999_999]) {
      const parts = unpackDraw(draw, bot);

      expect(Number.isInteger(parts.pauseMs)).toBe(true);
      expect(Number.isInteger(parts.roll)).toBe(true);
      expect(Number.isInteger(parts.pick)).toBe(true);
    }
  });

  it("does not tie the roll to the pause: every roll comes with every pause", () => {
    const rollsByPause = new Map<number, Set<number>>();

    for (let draw = 0; draw < 301 * 100; draw += 1) {
      const { pauseMs, roll } = unpackDraw(draw, bot);
      const rolls = rollsByPause.get(pauseMs) ?? new Set<number>();

      rolls.add(roll);
      rollsByPause.set(pauseMs, rolls);
    }

    expect(rollsByPause.size).toBe(301);
    expect([...rollsByPause.values()].every(rolls => rolls.size === 100)).toBe(true);
  });

  it("does not tie the pick to the roll: every pick comes with every roll", () => {
    const picksByRoll = new Map<number, Set<number>>();

    for (let draw = 0; draw < 301 * 100 * 33; draw += 301) {
      const { roll, pick } = unpackDraw(draw, bot);
      const picks = picksByRoll.get(roll) ?? new Set<number>();

      picks.add(pick);
      picksByRoll.set(roll, picks);
    }

    expect(picksByRoll.size).toBe(100);
    expect([...picksByRoll.values()].every(picks => picks.size === 33)).toBe(true);
  });

  it("reads the pause from the tables it is given", () => {
    const slow = { ...bot, pauseMinMs: 1000, pauseSpreadMs: 10 };

    expect(unpackDraw(9, slow)).toEqual({ pauseMs: 1009, roll: 0, pick: 0 });
    expect(unpackDraw(10, slow)).toEqual({ pauseMs: 1000, roll: 1, pick: 0 });
  });
});
