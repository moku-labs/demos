/**
 * @file LanguageCard — one of the two side-by-side cards on the TV language-pick screen (A2). Shows
 * the language's flag, its name (and optional Cyrillic sub-label), and a live row of voter avatars
 * (F13). The card that currently leads the tally is highlighted (lemon border + glow, slight scale).
 */
import { Flag } from "./Flag";
import type { LanguageCardProps } from "./types";

/**
 * Render a single language choice card for the match-setup language vote.
 *
 * Presentational only: the parent owns the tally and passes `leading` for whichever card is ahead
 * and the `voters` avatars to show beneath. The flag is drawn by the sibling {@link Flag} component.
 *
 * @param props - The language-card props.
 * @param props.lang - The language code this card represents (`"en"` | `"ru"`).
 * @param props.label - The display name (Fredoka), e.g. "English" / "Русский".
 * @param props.sublabel - Optional secondary line (Quicksand, dim), e.g. "Russian · Кириллица".
 * @param props.flag - Which flag to render (`"us"` | `"ru"`).
 * @param props.voters - Avatar emoji of the peers currently voting for this language (F13).
 * @param props.leading - Whether this card currently leads the vote (drives the highlight).
 * @returns The language-card element.
 * @example
 * ```tsx
 * <LanguageCard lang="en" label="English" flag="us" voters={["🦊", "🦄", "🐯"]} leading />
 * <LanguageCard lang="ru" label="Русский" sublabel="Russian · Кириллица" flag="ru" voters={["🐙", "🐸"]} />
 * ```
 */
export function LanguageCard({ lang, label, sublabel, flag, voters, leading }: LanguageCardProps) {
  return (
    <div
      data-component="language-card"
      data-lang={lang}
      data-leading={leading ? "true" : undefined}
    >
      <div data-flag-wrap>
        <Flag code={flag} />
      </div>
      <div data-label>{label}</div>
      {sublabel ? <div data-sublabel>{sublabel}</div> : null}
      <div data-voters>
        {voters.length > 0 ? (
          voters.map((avatar, i) => (
            <span key={`${avatar}-${i}`} data-voter>
              {avatar}
            </span>
          ))
        ) : (
          <span data-voters-empty>no votes yet</span>
        )}
      </div>
    </div>
  );
}
