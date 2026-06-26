/**
 * @file language plugin — type definitions skeleton (signatures from .planning/specs/03).
 */
import type { Lang, PeerId } from "../../lib/types";

/** Plugin config — selectable languages, the vote window, and the tie/no-vote default. */
export type Config = {
  languages: readonly Lang[];
  voteWindowMs: number;
  defaultLang: Lang;
};

/** One language option in the tally — the language + the peers currently voting for it. */
export type VoteOption = { lang: Lang; voters: PeerId[] };

/** Host-internal state — each peer's current vote (last write wins). */
export type State = Map<PeerId, Lang>;

/** Public API consumed by match-flow via `ctx.require(languagePlugin)`. */
export type Api = {
  openVote(onConfirm: (lang: Lang) => void): void;
  cancelVote(): void;
  result(): Lang | null;
};
