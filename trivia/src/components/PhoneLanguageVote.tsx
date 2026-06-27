/**
 * @file PhoneLanguageVote — the phone language vote screen: two big language buttons + the current leader.
 * Each tap sends a `language-vote` intent (wired by the controller island). Rendered for the
 * `languageVote` phase.
 */
import type { JSX } from "preact";
import type { Lang, TriviaState } from "../lib/types";
import { secondsLeft } from "../lib/view";
import { ClayButton } from "./ClayButton";

/** Props for the phone language vote. */
export type PhoneLanguageVoteProps = {
  /** The merged synced snapshot (language vote state). */
  s: TriviaState;
  /** The ticking clock (ms) so the countdown re-renders. */
  now: number;
  /** Cast this phone's vote for a language. */
  onVote: (lang: Lang) => void;
};

/**
 * Render the phone language vote — English/Русский buttons + the leading tally + countdown.
 *
 * @param props - The language vote props.
 * @returns The language vote screen.
 * @example
 * ```tsx
 * <PhoneLanguageVote s={s} now={now} onVote={onVote} />
 * ```
 */
export function PhoneLanguageVote({ s, now, onVote }: PhoneLanguageVoteProps): JSX.Element {
  const secs = secondsLeft(s.languageVote.deadlineTs, now);
  return (
    <div data-component="phone-language-vote" data-screen="lang-vote">
      <h2 data-phone-title>Vote a language</h2>
      <div data-vote-buttons>
        <ClayButton tone="lemon" onClick={() => onVote("en")}>
          🇺🇸 English
        </ClayButton>
        <ClayButton tone="sky" onClick={() => onVote("ru")}>
          🇷🇺 Русский
        </ClayButton>
      </div>
      <p data-wait-hint>
        Leading: {s.languageVote.leading === "ru" ? "Русский" : "English"} · {secs}s
      </p>
    </div>
  );
}
