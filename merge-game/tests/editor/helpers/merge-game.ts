/**
 * @file The merge game of this demo (`game.ts`), loaded when a test asks for it. The registry's
 * `GameLike` is the public `Registry.GameLike` of `@moku-labs/editor/agent`.
 */
import type { Registry } from "@moku-labs/editor/agent";

/**
 * What a test holds on to: the app of the merge game (the registry's `game`).
 */
export type MergeGame = { readonly app: Registry.GameLike };

/**
 * The game functions the editor tests use: headless, and with the (inert) screen.
 */
export type MergeGameFixture = {
  createGame(options?: { readonly seed?: number }): MergeGame;
  createScreenGame(options?: { readonly seed?: number }): MergeGame;
};

/**
 * Loads the merge game of the demo. Tests set `globalThis.__MOKU_GAME_DEV__ = true` before they
 * run a door command and delete it afterwards.
 *
 * @returns The game's `createGame` and `createScreenGame`.
 */
export async function loadMergeGame(): Promise<MergeGameFixture> {
  const { createGame, createScreenGame } = await import("../../../game");
  return { createGame, createScreenGame } as unknown as MergeGameFixture;
}
