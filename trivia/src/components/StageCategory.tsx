/**
 * @file StageCategory — the TV category pick screen (A3, spectator view): who's picking + the category
 * grid (exhausted categories dimmed). Rendered for both `categoryPick` and `categoryReveal` phases.
 * When a category is chosen (`match.chosenCategory` set), the chosen card glows + scales (state="chosen"),
 * all others dim to 28% (state="dimmed"), and the F3 category banner drops in above the grid.
 * Until the bank has loaded (`bank.status !== "ready"`) the chooser row shows a subtle "Loading
 * questions…" line in place of the difficulty pips (mirroring the phone's inert-button wait state).
 */
import type { JSX } from "preact";
import type { CategoryId } from "../config";
import { TRIVIA } from "../config";
import { ramp } from "../lib/difficulty";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { CategoryBanner } from "./CategoryBanner";
import { CategoryCard } from "./CategoryCard";
import { DifficultyPips } from "./DifficultyPips";

/** Props for the category-pick / category-reveal screen. */
export type StageCategoryProps = {
  /** The merged synced snapshot (active peer + per-category availability + chosenCategory). */
  s: TriviaState;
};

/**
 * Render the TV category pick / reveal — the active player row + difficulty pips + the 3×2 grid.
 * When `match.chosenCategory` is set (during the `categoryReveal` beat) the F3 banner drops in
 * above the grid; the chosen card glows and the rest fade to 28%. Before the bank is ready the
 * chooser row swaps the difficulty pips for a "Loading questions…" line.
 *
 * @param props - The category-pick/reveal screen props.
 * @returns The category-pick/reveal screen.
 * @example
 * ```tsx
 * <StageCategory s={s} />
 * ```
 */
export function StageCategory({ s }: StageCategoryProps): JSX.Element {
  const active = findPlayer(s.players, s.match.activePeer);
  const chosen = s.match.chosenCategory;
  const exhausted = new Set(s.categories.filter(c => c.exhausted).map(c => c.id));
  // The bank may still be loading when the picker opens (mirrors the phone's inert-button state): show a
  // subtle "Loading questions…" line in the chooser row in place of the difficulty pips until it is ready.
  const ready = s.bank.status === "ready";

  /** Derive the card state for a given category id. */
  function cardState(id: CategoryId): "idle" | "chosen" | "dimmed" {
    if (chosen) return id === chosen ? "chosen" : "dimmed";
    return exhausted.has(id) ? "dimmed" : "idle";
  }

  const chosenMeta = chosen ? TRIVIA.categories.find(c => c.id === chosen) : undefined;

  return (
    <div
      data-component="stage-category"
      data-screen="category"
      data-revealing={chosen ? "true" : undefined}
    >
      {/* Chooser row — hidden during the reveal beat (design A3: "The chooser row hides"). */}
      {!chosen && (
        <div data-chooser data-waiting={ready ? undefined : "true"}>
          <span data-who>
            {active?.avatar ?? "•"} {active?.name ?? "Someone"} is picking a category…
          </span>
          {ready ? (
            <DifficultyPips tier={ramp(s.match.round)} />
          ) : (
            <span data-loading-hint>Loading questions…</span>
          )}
        </div>
      )}
      {/* F3 category banner — drops in above the grid once a category is chosen. */}
      {chosenMeta && <CategoryBanner category={chosenMeta} color={active?.color} />}
      <div data-category-grid>
        {TRIVIA.categories.map(category => (
          <CategoryCard
            key={category.id}
            category={category}
            state={cardState(category.id)}
            color={active?.color}
          />
        ))}
      </div>
    </div>
  );
}
