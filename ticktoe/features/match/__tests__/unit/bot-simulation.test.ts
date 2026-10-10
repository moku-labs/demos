/**
 * @file The bot against two scripted humans, 2000 seeded rounds per level and human. The bands are
 * what makes Easy easy and Hard hard; the numbers that hold them are `tables.bot`.
 */
import { tables } from "@core/tables";
import type { Board, BotTables, Level, Mark, RoundResult } from "@core/types";
import { describe, expect, it } from "vitest";
import { botMove, emptyCells, resultOf, winnerOf } from "../../rules";

/** How many rounds one level plays against one human. */
const ROUNDS = 2000;

/** The time one test of this file may take: Hard searches the whole tree at every move. */
const SLOW_MS = 60_000;

/** The numbers under test: the ones the game ships. */
const bot: BotTables = tables.bot;

/** A random source: an integer below the bound. */
type Random = (bound: number) => number;

/** A human: the cell it takes on this board. */
type Human = (board: Board, random: Random) => number;

/**
 * A small seeded generator (mulberry32), so every run of this file plays the same rounds.
 */
function seeded(seed: number): Random {
  let state = seed;

  return bound => {
    state = Math.imul(state + 0x6d_2b_79_f5, 1);

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296) * bound);
  };
}

/** The first free cell that gives the mark a line now. */
function winningCell(board: Board, mark: Mark): number | undefined {
  return emptyCells(board).find(cell => {
    const next = [...board];

    next[cell] = mark;

    return winnerOf(next).mark === mark;
  });
}

/** A human who takes any free cell. */
const randomHuman: Human = (board, random) => {
  const free = emptyCells(board);

  return free[random(free.length)] ?? -1;
};

/** A human who wins when it can, blocks when it must, and else takes any free cell. */
const greedyHuman: Human = (board, random) =>
  winningCell(board, 1) ?? winningCell(board, 2) ?? randomHuman(board, random);

/**
 * Plays one round and answers how it ended for the human.
 */
function playRound(level: Level, human: Human, first: Mark, random: Random): RoundResult {
  const board: Board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let turn = first;

  while (resultOf(board) === "none") {
    const cell =
      turn === 1 ? human(board, random) : botMove(board, 2, level, random(1_000_000), bot);

    board[cell] = turn;
    turn = turn === 1 ? 2 : 1;
  }

  return resultOf(board);
}

/**
 * Plays the rounds of one level against one human. The first move alternates, as in the game.
 */
function simulate(level: Level, human: Human, seed: number) {
  const random = seeded(seed);
  const counts = { win: 0, loss: 0, draw: 0, none: 0 };

  for (let round = 0; round < ROUNDS; round += 1) {
    counts[playRound(level, human, round % 2 === 0 ? 1 : 2, random)] += 1;
  }

  return { ...counts, winShare: counts.win / ROUNDS };
}

describe("the bot over 2000 seeded rounds per level", () => {
  it("plays every round to an end", () => {
    const rounds = simulate("normal", randomHuman, 1);

    expect(rounds.none).toBe(0);
    expect(rounds.win + rounds.loss + rounds.draw).toBe(ROUNDS);
  });

  it("plays the same rounds for the same seed", () => {
    expect(simulate("easy", greedyHuman, 7)).toEqual(simulate("easy", greedyHuman, 7));
  });

  it("Easy: the greedy human wins more than 60%", () => {
    expect(simulate("easy", greedyHuman, 11).winShare).toBeGreaterThan(0.6);
  });

  it("Easy: the random human still wins rounds", () => {
    expect(simulate("easy", randomHuman, 12).winShare).toBeGreaterThan(0.2);
  });

  it("Normal: the greedy human wins between 10% and 40%", () => {
    const { winShare } = simulate("normal", greedyHuman, 21);

    expect(winShare).toBeGreaterThan(0.1);
    expect(winShare).toBeLessThan(0.4);
  });

  it("Normal is harder than Easy for both humans", () => {
    expect(simulate("normal", greedyHuman, 31).winShare).toBeLessThan(
      simulate("easy", greedyHuman, 31).winShare
    );
    expect(simulate("normal", randomHuman, 32).winShare).toBeLessThan(
      simulate("easy", randomHuman, 32).winShare
    );
  });

  it(
    "Hard: the greedy human never wins",
    () => {
      expect(simulate("hard", greedyHuman, 41).win).toBe(0);
    },
    SLOW_MS
  );

  it(
    "Hard: the random human never wins",
    () => {
      expect(simulate("hard", randomHuman, 42).win).toBe(0);
    },
    SLOW_MS
  );

  it(
    "the bands hold for other seeds too",
    () => {
      for (const seed of [101, 202, 303]) {
        const normal = simulate("normal", greedyHuman, seed).winShare;

        expect(simulate("easy", greedyHuman, seed).winShare).toBeGreaterThan(0.6);
        expect(normal).toBeGreaterThan(0.1);
        expect(normal).toBeLessThan(0.4);
        expect(simulate("hard", greedyHuman, seed).win).toBe(0);
      }
    },
    SLOW_MS
  );
});
