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
  // A press made while a node plays its animation is kept this long, in ms of the game's frames.
  press: { keepMs: 500 }
} as const;
