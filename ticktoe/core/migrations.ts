/**
 * @file The migrations of the save. Version 1 was the scaffold's tap counter; version 2 is the game.
 */
import type { Model } from "@moku-labs/game";
import { startingPlayer } from "./state";
import type { Level } from "./types";

/**
 * A JSON object: keys with JSON values. Not `null` and not an array.
 */
type JsonObject = { [key: string]: Model.Json };

/**
 * Tells whether a JSON value is an object with keys. `typeof` alone would let `null` and an array
 * through.
 *
 * @param value - Any part of a save, or `undefined` for a key the save does not have.
 * @returns True for an object that is neither `null` nor an array.
 */
function isJsonObject(value: Model.Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Tells whether a saved value is one of the three levels.
 *
 * @param value - What the save holds as the level.
 * @returns True for "easy", "normal" and "hard".
 */
function isLevel(value: Model.Json | undefined): value is Level {
  return value === "easy" || value === "normal" || value === "hard";
}

/**
 * Tells whether a saved value is a count of rounds: a whole number, 0 or more.
 *
 * @param value - What the save holds as one count.
 * @returns True for 0, 1, 2 and so on.
 */
function isCount(value: Model.Json | undefined): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Tells whether a saved value is a score: the three counts, each a count of rounds.
 *
 * @param value - What the save holds as the score.
 * @returns True when `you`, `draws` and `bot` are all counts.
 */
function isScore(value: Model.Json | undefined): boolean {
  return isJsonObject(value) && isCount(value.you) && isCount(value.draws) && isCount(value.bot);
}

/**
 * Tells whether a saved player has the shape the game reads.
 *
 * @param player - The player of a save, of any version.
 * @returns True when the level, the score and the next first mover are all there and sound.
 */
function isGamePlayer(player: Model.Json | undefined): player is JsonObject {
  if (!isJsonObject(player)) return false;

  const hasFirstMover = player.nextFirst === 1 || player.nextFirst === 2;

  return isLevel(player.level) && isScore(player.score) && hasFirstMover;
}

/**
 * Version 1 to 2: a save that is not a game save starts as a new player. Its rng is kept when it is
 * an object, so the bot's stream goes on; anything else starts the random state over.
 *
 * @param state - The whole save document of version 1.
 * @returns The save document of version 2.
 */
export function toGameSave(state: Model.Json): Model.Json {
  const save = isJsonObject(state) ? state : {};

  return {
    player: isGamePlayer(save.player) ? save.player : structuredClone(startingPlayer),
    rng: isJsonObject(save.rng) ? save.rng : {}
  };
}
