/**
 * @file language plugin — pure domain functions for vote tallying.
 *
 * No `ctx`, no room framework coupling. All wiring lives in `index.ts`.
 * These functions receive plain data and return plain data.
 */
import type { Lang, PeerId } from "../../lib/types";
import type { VoteOption } from "./types";

// ─── tally ────────────────────────────────────────────────────────────────────

/**
 * Record one peer's vote in the mutable state map (last-write-wins) and return the updated
 * options array plus the current leading language.
 *
 * @param state - The host-internal per-peer vote map (mutated in place).
 * @param peerId - The peer casting the vote.
 * @param lang - The language the peer voted for.
 * @param languages - The ordered list of selectable languages (from config).
 * @param defaultLang - Fallback for the `leading` field on tie/zero.
 * @returns The updated `options` array and the current `leading` language.
 * @example
 * ```ts
 * const { options, leading } = recordVote(state, "peer-1", "ru", ["en", "ru"], "en");
 * ```
 */
export const recordVote = (
  state: Map<PeerId, Lang>,
  peerId: PeerId,
  lang: Lang,
  languages: readonly Lang[],
  defaultLang: Lang
): { options: VoteOption[]; leading: Lang } => {
  state.set(peerId, lang);
  const options = buildOptions(state, languages);
  const leading = tallyVotes(state, languages, defaultLang);
  return { options, leading };
};

/**
 * Tally the current state map and return the majority language, or `defaultLang` on tie/zero.
 *
 * @param state - The host-internal per-peer vote map.
 * @param languages - The ordered list of selectable languages.
 * @param defaultLang - Tie/zero-vote fallback language.
 * @returns The winning language.
 * @example
 * ```ts
 * const winner = tallyVotes(state, ["en", "ru"], "en");
 * ```
 */
export const tallyVotes = (
  state: Map<PeerId, Lang>,
  languages: readonly Lang[],
  defaultLang: Lang
): Lang => {
  const counts = new Map<Lang, number>();
  for (const l of state.values()) {
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let winner: Lang = defaultLang;
  let maxCount = 0;
  for (const l of languages) {
    const count = counts.get(l) ?? 0;
    if (count > maxCount) {
      maxCount = count;
      winner = l;
    }
  }
  return winner;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the `options` array for the `languageVote` slice from the current per-peer vote map.
 *
 * @param state - The per-peer vote map.
 * @param languages - The ordered list of selectable languages.
 * @returns One `VoteOption` per language, each listing the peers currently voting for it.
 * @example
 * ```ts
 * const options = buildOptions(state, ["en", "ru"]);
 * ```
 */
export const buildOptions = (state: Map<PeerId, Lang>, languages: readonly Lang[]): VoteOption[] =>
  languages.map(lang => ({
    lang,
    voters: [...state.entries()].filter(([, v]) => v === lang).map(([k]) => k)
  }));
