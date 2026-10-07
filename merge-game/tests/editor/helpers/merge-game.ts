/**
 * @file The merge game of this demo (`index.ts`), loaded when a test asks for it. The registry's
 * `GameLike` is the public `Registry.GameLike` of `@moku-labs/editor/agent`.
 */
import type { Registry } from "@moku-labs/editor/agent";

/**
 * What a test holds on to: the app of the merge game (the registry's `game`).
 */
export type MergeGame = { readonly app: Registry.GameLike };

/**
 * The two apps of the game the editor tests use: headless, and with the (inert) screen.
 */
export type MergeGameFixture = {
  headless(seams?: { readonly seed?: number }): MergeGame;
  screen(seams?: { readonly seed?: number }): MergeGame;
};

/**
 * Loads the merge game of the demo. Tests set `globalThis.__MOKU_GAME_DEV__ = true` before they
 * run a door command and delete it afterwards.
 *
 * @returns The game's `headless` and `screen`.
 */
export async function loadMergeGame(): Promise<MergeGameFixture> {
  const { default: game } = await import("../../../index");
  return game as unknown as MergeGameFixture;
}
