/**
 * @file The save migration: an old scaffold save becomes a new player, a game save is kept. A save
 * is JSON a disk handed back, so the migration is given every shape a broken one can have.
 */
import type { Model } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { toGameSave } from "../../migrations";
import { startingPlayer } from "../../state";

/** One row of a table: what the case is called, and the JSON it hands to the migration. */
type Case = [name: string, value: Model.Json];

// oxlint-disable-next-line unicorn/no-null -- a save is JSON, and JSON has null
const NULL = null;

/** The random state of a save: the seed and the bot's stream. */
const RNG = { seed: 7, streams: { bot: 3 } };

/** What a save that is no game save becomes when it brings no rng either. */
const NEW_SAVE = { player: startingPlayer, rng: {} };

/**
 * A game player of version 2 with some fields changed.
 */
function playerWith(fields: { [key: string]: Model.Json } = {}): { [key: string]: Model.Json } {
  return { level: "hard", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 2, ...fields };
}

/**
 * The player of a migrated save. The migration answers JSON, so the test narrows it.
 */
function playerOf(save: Model.Json): Model.Json | undefined {
  return typeof save === "object" && save !== NULL && !Array.isArray(save)
    ? save.player
    : undefined;
}

const notDocuments: Case[] = [
  ["a string", "save"],
  ["a number", 3],
  ["null", NULL],
  ["an array", [{ player: playerWith() }]],
  ["an empty object", {}]
];

const brokenPlayers: Case[] = [
  ["a string", "player"],
  ["a number", 1],
  ["null", NULL],
  ["an array", ["hard"]],
  ["the scaffold's tap counter", { taps: 3 }],
  ["at a level outside the three", playerWith({ level: "expert" })],
  ["without a level", { score: { you: 0, draws: 0, bot: 0 }, nextFirst: 1 }],
  ["with a first mover outside the two", playerWith({ nextFirst: 3 })],
  ["without a first mover", { level: "easy", score: { you: 0, draws: 0, bot: 0 } }],
  ["without a score", { level: "easy", nextFirst: 1 }]
];

const brokenScores: Case[] = [
  ["null", NULL],
  ["a number", 4],
  ["a string", "2:1:1"],
  ["an array", [2, 1, 1]],
  ["empty", {}],
  ["without one count", { you: 2, draws: 1 }],
  ["with a string count", { you: "2", draws: 1, bot: 1 }],
  ["with a null count", { you: 2, draws: NULL, bot: 1 }],
  ["with a negative count", { you: 2, draws: 1, bot: -1 }],
  ["with a fractional count", { you: 2.5, draws: 1, bot: 1 }]
];

const brokenRngs: Case[] = [
  ["an array", [1, 2]],
  ["a number", 7],
  ["a string", "seed"],
  ["null", NULL]
];

describe("a save of version 1", () => {
  it("starts a new player from the scaffold's tap counter and keeps its rng", () => {
    expect(toGameSave({ player: { taps: 3 }, rng: RNG })).toEqual({
      player: startingPlayer,
      rng: RNG
    });
  });

  it("keeps a game save as it is", () => {
    const save = { player: playerWith(), rng: RNG };

    expect(toGameSave(save)).toEqual({ player: playerWith(), rng: RNG });
    expect(playerOf(toGameSave(save))).toBe(save.player);
  });

  it("keeps a score of zeros: a count is 0 or more", () => {
    const player = playerWith({ score: { you: 0, draws: 0, bot: 0 } });

    expect(toGameSave({ player, rng: RNG })).toEqual({ player, rng: RNG });
  });

  it("starts a new player as a copy, so no save ever writes into the starting player", () => {
    const player = playerOf(toGameSave({}));

    expect(player).toEqual(startingPlayer);
    expect(player).not.toBe(startingPlayer);
  });
});

describe("a save that is not a document", () => {
  it.each(notDocuments)("starts a new player from %s", (_name, state) => {
    expect(toGameSave(state)).toEqual(NEW_SAVE);
  });
});

describe("a save with a broken player", () => {
  it.each(brokenPlayers)("starts a new player when the player is %s", (_name, player) => {
    expect(toGameSave({ player, rng: RNG })).toEqual({ player: startingPlayer, rng: RNG });
  });

  it.each(brokenScores)("starts a new player when the score is %s", (_name, score) => {
    expect(toGameSave({ player: playerWith({ score }), rng: RNG })).toEqual({
      player: startingPlayer,
      rng: RNG
    });
  });
});

describe("the rng of a save", () => {
  it.each(brokenRngs)("starts over when it is %s, and the game player stays", (_name, rng) => {
    expect(toGameSave({ player: playerWith(), rng })).toEqual({ player: playerWith(), rng: {} });
  });

  it("starts over when the save has none", () => {
    expect(toGameSave({ player: { taps: 1 } })).toEqual(NEW_SAVE);
  });
});
