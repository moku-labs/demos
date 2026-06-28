/**
 * @file StageCategory — the TV category pick screen (A3, spectator view): who's picking + the category
 * grid (exhausted categories dimmed). A pure presentational component fed the snapshot. Renders this
 * round's offered subset (`s.offer`) — a fresh random draw — not the full pool. Rendered by the stage
 * island's render layer for `phase === "categoryPick"`.
 */
import type { JSX } from "preact";
import { ramp } from "../lib/difficulty";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { CategoryCard } from "./CategoryCard";
import { DifficultyPips } from "./DifficultyPips";

/** Props for the category-pick screen. */
export type StageCategoryProps = {
  /** The merged synced snapshot (active peer + per-category availability). */
  s: TriviaState;
};

/**
 * Render the TV category pick — the active player's name + the difficulty pips and the 3×2 category grid.
 *
 * @param props - The category-pick screen props.
 * @returns The category-pick screen.
 * @example
 * ```tsx
 * <StageCategory s={s} />
 * ```
 */
export function StageCategory({ s }: StageCategoryProps): JSX.Element {
  const active = findPlayer(s.players, s.match.activePeer);

  return (
    <div data-component="stage-category" data-screen="category">
      <div data-chooser>
        <span data-who>
          {active?.avatar ?? "•"} {active?.name ?? "Someone"} is picking a category…
        </span>
        <DifficultyPips tier={ramp(s.match.round)} />
      </div>
      <div data-category-grid>
        {s.offer.map(category => (
          <CategoryCard
            key={category.id}
            category={category}
            state={category.exhausted ? "dimmed" : "idle"}
            color={active?.color}
          />
        ))}
      </div>
    </div>
  );
}
