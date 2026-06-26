/**
 * @file language plugin — type definitions.
 * Shared types for the config, host-internal state, public API, and the `languageVote` slice.
 */
import type { Lang, PeerId } from "../../lib/types";

/** Plugin config — selectable languages, the vote window, and the tie/no-vote default. */
export type Config = {
  /** Selectable languages. Default `["en", "ru"]`. */
  languages: readonly Lang[];
  /** Vote window before auto-confirm (ms). Default `5000`. */
  voteWindowMs: number;
  /** Winner on a tie or zero votes. Default `"en"`. */
  defaultLang: Lang;
};

/** One language option in the tally — the language plus the peers currently voting for it. */
export type VoteOption = { lang: Lang; voters: PeerId[] };

/** Host-internal state — each peer's current vote (last write wins). */
export type State = Map<PeerId, Lang>;

/** Public API consumed by match-flow via `ctx.require(languagePlugin)`. */
export type Api = {
  /**
   * Open the language vote, arm the window timer, and stash `onConfirm` for expiry.
   *
   * @param onConfirm - Invoked exactly once with the winning language when the window expires.
   * @returns Nothing.
   * @example
   * ```ts
   * app.language.openVote(lang => matchFlow.advance(lang));
   * ```
   */
  openVote(onConfirm: (lang: Lang) => void): void;
  /**
   * Cancel the in-flight vote (clears the timer, closes the slice). No-op if not open.
   *
   * @returns Nothing.
   * @example
   * ```ts
   * app.language.cancelVote();
   * ```
   */
  cancelVote(): void;
  /**
   * Read the confirmed language, or `null` while the vote is open or before any vote.
   *
   * @returns The confirmed language, or `null`.
   * @example
   * ```ts
   * const lang = app.language.result(); // "en" | "ru" | null
   * ```
   */
  result(): Lang | null;
};
