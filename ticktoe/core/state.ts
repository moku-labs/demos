/**
 * @file The state of the game: what a save holds, what one session holds, and the new player.
 */
import type { Board, Level, Mark, RoundResult, Score } from "./types";

/**
 * The saved player: the level, the score and who moves first in the next round.
 */
export type Player = { level: Level; score: Score; nextFirst: Mark };

/**
 * The session: the screen and the round. Never saved.
 */
export type Session = {
  screen: "home" | "board";
  board: Board;
  turn: Mark;
  result: RoundResult;
  winLine: number[];
  botDraw: number;
  botDueAt: number;
  celebrateDueAt: number;
  card: boolean;
  shownScore: Score;
  splash: { pct: number; ready: boolean; minPassed: boolean; minDueAt: number };
};

/**
 * The state of a new player.
 */
export const startingPlayer: Player = {
  level: "normal",
  score: { you: 0, draws: 0, bot: 0 },
  nextFirst: 1
};

/**
 * The session at every start.
 */
export const startingSession: Session = {
  screen: "home",
  board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  turn: 1,
  result: "none",
  winLine: [],
  botDraw: 0,
  botDueAt: 0,
  celebrateDueAt: 0,
  card: false,
  shownScore: { you: 0, draws: 0, bot: 0 },
  splash: { pct: 0, ready: false, minPassed: false, minDueAt: 0 }
};
