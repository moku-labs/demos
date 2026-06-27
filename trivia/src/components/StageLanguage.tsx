/**
 * @file StageLanguage — the TV language pick screen (A2): the two language cards + the live tally. A pure
 * presentational component fed the snapshot + the ticking `now` (so the countdown re-renders). Rendered
 * by the stage island's render layer for `phase === "languageVote"`.
 */
import type { JSX } from "preact";
import type { TriviaState } from "../lib/types";
import { findPlayer, secondsLeft } from "../lib/view";
import { LanguageCard } from "./LanguageCard";

/** Props for the language-pick screen. */
export type StageLanguageProps = {
  /** The merged synced snapshot (language vote + players). */
  s: TriviaState;
  /** The ticking clock (ms) so the confirm countdown re-renders. */
  now: number;
};

/**
 * Render the TV language pick — English/Русский cards with their voter avatars + the leading tally.
 *
 * @param props - The language-pick screen props.
 * @returns The language-pick screen.
 * @example
 * ```tsx
 * <StageLanguage s={s} now={now} />
 * ```
 */
export function StageLanguage({ s, now }: StageLanguageProps): JSX.Element {
  const vote = s.languageVote;
  const votersFor = (lang: string): string[] =>
    (vote.options.find(o => o.lang === lang)?.voters ?? []).map(
      id => findPlayer(s.players, id)?.avatar ?? "•"
    );
  const en = votersFor("en");
  const ru = votersFor("ru");
  const leadLabel = vote.leading === "ru" ? "Русский" : "English";
  const secs = secondsLeft(vote.deadlineTs, now);

  return (
    <div data-component="stage-language" data-screen="language">
      <h1 data-title>Pick a language for this match</h1>
      <p data-subtitle>Most votes wins — tap on your phone</p>
      <div data-language-cards>
        <LanguageCard
          lang="en"
          label="English"
          flag="us"
          voters={en}
          leading={vote.leading === "en"}
        />
        <LanguageCard
          lang="ru"
          label="Русский"
          sublabel="Russian · Кириллица"
          flag="ru"
          voters={ru}
          leading={vote.leading === "ru"}
        />
      </div>
      <p data-tally>
        {leadLabel} leads {en.length}–{ru.length} · Confirming in {secs}s…
      </p>
    </div>
  );
}
