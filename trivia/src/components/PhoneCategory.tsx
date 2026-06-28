/**
 * @file PhoneCategory — the active player's phone category list (A11). Each tap sends a `category-pick`
 * intent (wired by the controller island). Shows this round's offered subset (`s.offer`) — the same
 * random draw the TV grid renders. Rendered for the active player in both `categoryPick` and
 * `categoryReveal` phases. During the reveal beat (`match.chosenCategory` set) the chosen button stays
 * lit and the others fade — the buttons are disabled so a second tap is a no-op.
 *
 * The picker can also open before the question bank has finished loading (the host fetches it at
 * language-confirm and the ~2s roundIntro usually covers it, but a slow LAN can lose the race). Until
 * `bank.status === "ready"` a tap would resolve no question host-side and be silently dropped — so the
 * buttons render inert with a "Loading questions…" hint instead of swallowing the tap.
 */
import type { JSX } from "preact";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { CategoryButton } from "./CategoryButton";

/** Props for the phone category list. */
export type PhoneCategoryProps = {
  /** The merged synced snapshot (self + categories + chosenCategory during the reveal beat). */
  s: TriviaState;
  /** Pick a category — fires the `category-pick` intent. No-op during the reveal beat. */
  onPickCategory: (id: string) => void;
};

/**
 * Render the active player's phone category list — a tap-friendly button per category.
 * When `match.chosenCategory` is set (during the `categoryReveal` beat), the chosen button
 * glows amber and the others fade; all buttons are disabled so a re-tap can't fire a second pick.
 * While the bank is still loading (`bank.status !== "ready"`), the buttons render inert under a
 * "Loading questions…" hint so a premature tap is never silently dropped.
 *
 * @param props - The category list props.
 * @returns The category list screen.
 * @example
 * ```tsx
 * <PhoneCategory s={s} onPickCategory={onPickCategory} />
 * ```
 */
export function PhoneCategory({ s, onPickCategory }: PhoneCategoryProps): JSX.Element {
  const self = findPlayer(s.players, s.self);
  // `chosenCategory` is `CategoryId | null` in the type, but over the live wire an unset cell can arrive
  // as `undefined` (not `null`) — so test truthiness, never `!== null`. A non-truthy value means "still
  // picking": the buttons MUST keep their `onPick` (a strict `!== null` check would mis-read `undefined`
  // as "revealing", drop `onPick`, and silently swallow every tap — freezing the round at categoryPick).
  const chosen = s.match.chosenCategory;
  const revealing = Boolean(chosen);

  // Bank not ready yet (still loading, or it errored): the host's category-pick would resolve no question
  // and drop the tap, so gate the buttons on readiness and surface a hint. `interactive` is the ONLY state
  // that wires `onPick`; the reveal beat and the loading wait both render inert buttons.
  const waiting = !revealing && s.bank.status !== "ready";
  const interactive = !revealing && !waiting;
  const waitHint = s.bank.status === "error" ? "Couldn't load questions…" : "Loading questions…";

  return (
    <div
      data-component="phone-category"
      data-screen="category-pick"
      data-revealing={revealing ? "true" : undefined}
      data-waiting={waiting ? "true" : undefined}
    >
      <h2 data-phone-title>
        Your turn to pick, {self?.avatar} {self?.name}!
      </h2>
      <div data-category-list>
        {s.offer.map((category, i) =>
          interactive ? (
            <CategoryButton
              key={category.id}
              category={category}
              revealIndex={i}
              onPick={() => onPickCategory(category.id)}
            />
          ) : (
            <CategoryButton
              key={category.id}
              category={category}
              revealIndex={i}
              selected={revealing && category.id === chosen}
            />
          )
        )}
      </div>
      {waiting && <p data-category-hint>{waitHint}</p>}
    </div>
  );
}
