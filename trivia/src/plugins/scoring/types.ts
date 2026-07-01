/**
 * @file scoring plugin — type definitions skeleton (signatures from .planning/specs/02).
 */
import type { CategoryId, PeerId, ScoreEntry, Tier } from "../../lib/types";

/** Plugin config — per-tier base points and the steal fraction. */
export type Config = {
  /**
   * Base points per difficulty tier for a correct answer. Default `{ easy: 100, medium: 200, hard: 300 }`.
   * Config merge is shallow — overriding `basePoints` replaces the WHOLE tier map, so an override must
   * provide all three keys (easy/medium/hard).
   */
  basePoints: Readonly<Record<Tier, number>>;
  /** Fraction of base a successful STEAL earns. Default 0.5 (medium correct +200 → steal +100). */
  stealFraction: number;
};

/** Host-internal per-peer stats for the end-of-match call-out (not synced). */
export type PlayerStats = {
  steals: number;
  curStreak: number;
  bestStreak: number;
  /** Sparse map: only categories the player answered correctly are present. */
  perCategory: Partial<Record<CategoryId, number>>;
};

/** Host-internal state — per-peer stats keyed by peer id. */
export type State = Map<PeerId, PlayerStats>;

/** End-of-match stat line for the podium (A8). */
export type EndStats = {
  mostSteals: { peerId: PeerId; count: number } | undefined;
  highestStreak: { peerId: PeerId; streak: number } | undefined;
  topCategory: Record<PeerId, CategoryId | undefined>;
};

/** Public API consumed by match-flow via `ctx.require(scoringPlugin)`. */
export type Api = {
  award(
    peerId: PeerId,
    opts: {
      correct: boolean;
      steal: boolean;
      tier: Tier;
      category: CategoryId;
      /**
       * Optional multiplier on the computed points (default 1). Drives the open-steal speed reward:
       * the fastest correct stealer awards at `factor = 1` (full steal value), slower ones at 0.6/0.4/…
       */
      factor?: number;
    }
  ): void;
  reset(): void;
  /**
   * Zero every player's round `delta` (and re-publish `scores`) WITHOUT touching totals/ranks. Called
   * as each new question goes live so the reveal/scoreboard "+N" only ever reflects THIS question —
   * fixing the stale-delta bug where a past round's scorer kept flashing "+N" every later reveal.
   */
  clearDeltas(): void;
  /** Re-key a player's score + stats from a stale peerId to their reconnected peerId (phone reload). */
  rebindPeer(oldPeerId: PeerId, newPeerId: PeerId): void;
  leaderboard(): readonly ScoreEntry[];
  endStats(): EndStats;
};
