/**
 * @file Shared domain types — slice payloads + intent contracts + the merged render state. The single
 * type leaf imported by the plugins and the bridge. Populated from the plugin specs during build.
 */
import type { PeerId } from "@moku-labs/room";
import type { CategoryId, Tier } from "../config";

/** Secret-free question payload for the `question` slice (no correctSlot/answerCheck). */
export type PublicQuestion = {
  id: string;
  category: CategoryId;
  tier: Tier;
  type: "text" | "image";
  imageUrl?: string;
  prompt: string;
  options: readonly string[];
};

/** One scoreboard row. */
export type ScoreEntry = {
  peerId: PeerId;
  total: number;
  delta: number;
  rank: number;
  prevRank: number;
};

/** A joined player's identity (chosen in the join wizard). */
export type PlayerProfile = {
  peerId: PeerId;
  name: string;
  color: string;
  avatar: string;
  connected: boolean;
  isHost: boolean;
};

/** The merged read of all synced slices the islands render. Filled during build. */
// biome-ignore lint/complexity/noBannedTypes: placeholder — populated from the slice specs at build
export type TriviaState = {};

/** Controller → host intent names (one owner each — see the plugin specs). */
export type IntentName =
  | "seen-history"
  | "language-vote"
  | "join-profile"
  | "start-game"
  | "category-pick"
  | "answer-lock"
  | "play-again";

/** Per-intent payloads. Filled during build. */
export type IntentPayload = Record<IntentName, unknown>;

// Re-export the shared aliases from their sources (this module is the single type leaf for the plugins).
export type { PeerId } from "@moku-labs/room";
export type { CategoryId, Lang, Tier } from "../config";
