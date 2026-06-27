/**
 * Scoring plugin — Standard tier.
 *
 * Awards points (correct + steal-partial, scaled by difficulty tier), maintains
 * running totals, per-round deltas, and rank (with previous rank for the F4
 * reorder animation). Computes end-of-match stats (most steals, highest streak,
 * top category per player) for the A8 podium call-out.
 *
 * `match-flow` drives scoring by direct API call: `app.scoring.award()` at
 * every reveal, `app.scoring.reset()` on play-again.
 *
 * No intents, no events. Pure in-memory transforms — no lifecycle hooks needed.
 *
 * @see README.md
 */
import { createPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import type { CategoryId, PeerId, ScoreEntry } from "../../lib/types";
import { computeAward, computeEndStats, computeLeaderboard, rebindScore, resetBoard } from "./api";
import { createScoringState } from "./state";
import type { Config } from "./types";

/**
 * Default scoring config.
 *
 * `basePoints` is the authoritative tier map: overriding it in `pluginConfigs`
 * replaces the WHOLE map (shallow merge) — supply all three keys (easy/medium/hard).
 */
const DEFAULT_CONFIG = {
  basePoints: { easy: 100, medium: 200, hard: 300 },
  stealFraction: 0.5
} satisfies Config;

/**
 * Scoring plugin — awards points, maintains ranks/deltas, and exposes
 * end-of-match statistics for the party-quiz podium.
 *
 * Depends on `stagePlugin` (for `mutate`) and `syncPlugin` (for slice registration).
 * Pure in-memory transforms with no resources to manage — no lifecycle hooks.
 */
export const scoringPlugin = createPlugin("scoring", {
  depends: [stagePlugin, syncPlugin],
  config: DEFAULT_CONFIG,
  createState: createScoringState,
  /**
   * Register the `scores` sync slice on init, seeding an empty board.
   *
   * @param ctx - Plugin context (provides `require` to reach `syncPlugin`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during the onInit phase.
   * ```
   */
  onInit: ctx => {
    ctx.require(syncPlugin).registerSlice("scores", { entries: [] });
  },
  /**
   * Build the public scoring API, closing over a per-app entries mirror.
   *
   * @param ctx - Plugin context (provides `state`, `config`, `require`).
   * @returns The scoring API (`award`, `reset`, `leaderboard`, `endStats`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during app assembly.
   * ```
   */
  api: ctx => {
    /** In-memory leaderboard mirror keyed by peerId (parallel to the synced slice). */
    const entries = new Map<PeerId, ScoreEntry>();

    return {
      /**
       * Award points for one reveal outcome and update all derived state.
       *
       * Points formula: `correct ? (steal ? round(base*stealFraction) : base) : 0`.
       * Updates the peer's total + this-round delta, recomputes all ranks
       * (capturing prevRank), updates streak and perCategory, and writes the
       * `scores` slice.
       *
       * @param peerId - The peer being scored.
       * @param opts - Award options.
       * @param opts.correct - Whether the player answered correctly.
       * @param opts.steal - Whether this is a steal opportunity.
       * @param opts.tier - The question's difficulty tier.
       * @param opts.category - The question's category.
       * @example
       * ```ts
       * app.scoring.award(peerId, { correct: true, steal: false, tier: "medium", category: "animals" });
       * ```
       */
      award: (
        peerId: PeerId,
        opts: {
          correct: boolean;
          steal: boolean;
          tier: "easy" | "medium" | "hard";
          category: CategoryId;
        }
      ) => {
        const newEntries = computeAward(ctx.state, entries, ctx.config, peerId, opts);
        ctx.require(stagePlugin).mutate("scores", () => ({ entries: newEntries }));
      },

      /**
       * Reset all scores and host-internal stats for a play-again with the same players.
       *
       * Zeros totals, deltas, and ranks; clears steals, streaks, and perCategory.
       * Re-publishes the `scores` slice so controllers see the cleared board.
       *
       * @example
       * ```ts
       * app.scoring.reset();
       * ```
       */
      reset: () => {
        const zeroed = resetBoard(ctx.state, entries);
        ctx.require(stagePlugin).mutate("scores", () => ({ entries: zeroed }));
      },

      /**
       * Re-key a player's score + host-internal stats from a stale peerId to their reconnected one.
       *
       * Called by match-flow's `join-profile` reconnect path: the room framework mints a fresh peerId
       * on every (re)join, so without this a reloaded phone's score would orphan. Re-publishes the
       * `scores` slice when a board row actually moved (no-op for a player who never scored).
       *
       * @param oldPeerId - The stale peerId to migrate the score/stats from.
       * @param newPeerId - The reconnected phone's fresh peerId to migrate to.
       * @example
       * ```ts
       * app.scoring.rebindPeer(stalePeerId, newPeerId);
       * ```
       */
      rebindPeer: (oldPeerId: PeerId, newPeerId: PeerId) => {
        const rows = rebindScore(ctx.state, entries, oldPeerId, newPeerId);
        if (rows) ctx.require(stagePlugin).mutate("scores", () => ({ entries: rows }));
      },

      /**
       * Return the current leaderboard sorted by total descending.
       *
       * Mirrors the synced `scores` slice. Used for the podium order.
       *
       * @returns A readonly array of `ScoreEntry` sorted by `total` descending.
       * @example
       * ```ts
       * const top = app.scoring.leaderboard();
       * ```
       */
      leaderboard: () => computeLeaderboard(entries),

      /**
       * Compute end-of-match statistics for the A8 podium call-out.
       *
       * @returns The `EndStats` object for the podium screen.
       * @example
       * ```ts
       * const { mostSteals, highestStreak, topCategory } = app.scoring.endStats();
       * ```
       */
      endStats: () => computeEndStats(ctx.state)
    };
  }
});
