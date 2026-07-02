/**
 * @file Pure view helpers shared by the stage + controller islands — player lookup, answer-slot and
 * category metadata, score formatting, and deadline math. No DOM, no room context: plain data in/out,
 * so the islands stay thin glue and these stay unit-testable.
 */
import { TRIVIA } from "../config";
import type { CategoryId, PlayerProfile } from "./types";

/** One answer slot's fixed presentation (letter · shape · colour), by index 0–3. */
export type SlotMeta = { letter: string; shape: string; hex: string };

/** One category's display metadata (name · emoji). */
export type CategoryMeta = { id: CategoryId; name: string; emoji: string };

/**
 * Find a player by peer id.
 *
 * @param players - The current roster.
 * @param peerId - The peer id to look up (a `null` id never matches).
 * @returns The matching profile, or `undefined`.
 * @example
 * ```ts
 * const active = findPlayer(state.players, state.match.activePeer);
 * ```
 */
export function findPlayer(
  players: readonly PlayerProfile[],
  peerId: string | null | undefined
): PlayerProfile | undefined {
  if (peerId === null || peerId === undefined) return undefined;
  return players.find(player => player.peerId === peerId);
}

/**
 * The fixed presentation for answer slot `index` (A/B/C/D · ▲◆●■ · colour), from `TRIVIA.answerSlots`.
 * Indices outside 0–3 fall back to slot A so a malformed question never throws.
 *
 * @param index - The slot index (0–3).
 * @returns The slot's letter, shape, and colour hex.
 * @example
 * ```ts
 * const { letter, shape, hex } = slotMeta(1); // { letter: "B", shape: "◆", hex: "#2D7DD2" }
 * ```
 */
export function slotMeta(index: number): SlotMeta {
  return TRIVIA.answerSlots[index] ?? TRIVIA.answerSlots[0];
}

/**
 * The display metadata (name · emoji) for a category id, from `TRIVIA.categories`. Unknown ids fall
 * back to the id as the name with a blank emoji.
 *
 * @param id - The category id.
 * @returns The category's display metadata.
 * @example
 * ```ts
 * categoryMeta("animals"); // { id: "animals", name: "Animals: Weird & Wonderful", emoji: "🦎" }
 * ```
 */
export function categoryMeta(id: string): CategoryMeta {
  const found = TRIVIA.categories.find(category => category.id === id);
  if (found) return found;
  return { id: id as CategoryId, name: id, emoji: "" };
}

/**
 * The number of currently-connected players — the input `ramp()`/`matchLength()` scale by (fair
 * round scaling — item 5). Always at least 1 so a transient empty-roster read never divides by zero.
 *
 * @param players - The current roster.
 * @returns The connected player count (≥ 1).
 * @example
 * ```ts
 * const tier = ramp(s.match.round, connectedPlayerCount(s.players), s.match.totalRounds);
 * ```
 */
export function connectedPlayerCount(players: readonly PlayerProfile[]): number {
  return Math.max(1, players.filter(player => player.connected).length);
}

/**
 * Format a score for display with thousands separators (e.g. `4200` → `"4,200"`).
 *
 * @param total - The raw score.
 * @returns The grouped string.
 * @example
 * ```ts
 * formatScore(4200); // "4,200"
 * ```
 */
export function formatScore(total: number): string {
  return total.toLocaleString("en-US");
}

/**
 * Whole seconds remaining until a deadline, clamped at 0. Used to drive the timer ring, steal bar, and
 * vote/end countdowns off the host's authoritative `deadlineTs` and the island's ticking `now`.
 *
 * @param deadlineTs - The epoch-ms deadline (or `null` when no timer is live → 0).
 * @param now - The current epoch-ms.
 * @returns Whole seconds left (≥ 0).
 * @example
 * ```ts
 * secondsLeft(state.question.deadlineTs, now); // 14
 * ```
 */
export function secondsLeft(deadlineTs: number | null, now: number): number {
  if (deadlineTs === null) return 0;
  return Math.max(0, Math.ceil((deadlineTs - now) / 1000));
}
