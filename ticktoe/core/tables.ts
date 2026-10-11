/**
 * @file Balance data as plain objects: the bot, the celebration, the splash and the press.
 */
import type { BotTables } from "./types";

/**
 * The numbers the bot rules read.
 */
const bot: BotTables = {
  pauseMinMs: 400,
  pauseSpreadMs: 301,
  normalHeuristicPct: 40,
  easyAsNormalPct: 25
};

/**
 * Every tunable number of the game.
 */
export const tables = {
  bot,
  celebrateMs: { win: 1100, loss: 900, draw: 1000 },
  splash: { minMs: 2400 },
  // A press made while a node plays its animation is kept this long, in ms of game time. It covers
  // the longest one, the board reset of a full board: 18 pieces and shadows pop off in
  // 200 + 17 x 25 = 625 ms, then the tray slides back in 120 + 460 = 580 ms. That is 1205 ms, and
  // 1300 ms on frames of 50 ms, the longest the engine hands out.
  press: { holdMs: 1400 }
} as const;
