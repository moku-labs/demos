/**
 * @file PhoneCategory — the active player's phone category list (A11). Each tap sends a `category-pick`
 * intent (wired by the controller island). Shows this round's offered subset (`s.offer`) — the same
 * random draw the TV grid renders. Rendered for the active player in the `categoryPick` phase.
 */
import type { JSX } from "preact";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { CategoryButton } from "./CategoryButton";

/** Props for the phone category list. */
export type PhoneCategoryProps = {
  /** The merged synced snapshot (self + categories). */
  s: TriviaState;
  /** Pick a category (publishes the question). */
  onPickCategory: (id: string) => void;
};

/**
 * Render the active player's phone category list — a tap-friendly button per category.
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
  return (
    <div data-component="phone-category" data-screen="category-pick">
      <h2 data-phone-title>
        Your turn to pick, {self?.avatar} {self?.name}!
      </h2>
      <div data-category-list>
        {s.offer.map(category => (
          <CategoryButton
            key={category.id}
            category={category}
            onPick={() => onPickCategory(category.id)}
          />
        ))}
      </div>
    </div>
  );
}
