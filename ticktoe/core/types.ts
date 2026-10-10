/**
 * @file The plain types of the game. The only core file a rule may import.
 */

/**
 * A player's mark: 1 is the human (X), 2 is the bot (O).
 */
export type Mark = 1 | 2;

/**
 * One cell of the board: 0 is empty.
 */
export type Cell = 0 | Mark;

/**
 * Nine cells, index 0..8, left to right, top to bottom.
 */
export type Board = Cell[];

/**
 * The strength of the bot.
 */
export type Level = "easy" | "normal" | "hard";

/**
 * The count of rounds by outcome.
 */
export type Score = { you: number; draws: number; bot: number };

/**
 * How a round ended for the human; "none" while it goes on.
 */
export type RoundResult = "none" | "win" | "loss" | "draw";

/**
 * The numbers the bot rules read. The node passes them in.
 */
export type BotTables = {
  pauseMinMs: number;
  pauseSpreadMs: number;
  normalHeuristicPct: number;
  easyAsNormalPct: number;
};
