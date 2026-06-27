/**
 * @file stage island — the render layer: the persistent TV frame (top bar B1 · the per-phase screen). A
 * pure function of the island state that switches on `match.phase` to the per-phase screen components, and
 * renders the full-stage roundIntro takeover. The transient overlays (reconnect/disconnect/pause) and the
 * mute control are their own sibling islands now. DOM glue only — all game logic is host-side.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { JSX } from "preact";
import { RoundIntro } from "../../components/RoundIntro";
import { StageCategory } from "../../components/StageCategory";
import { StageLanguage } from "../../components/StageLanguage";
import { StageLobby } from "../../components/StageLobby";
import { StagePodium } from "../../components/StagePodium";
import { StageQuestion } from "../../components/StageQuestion";
import { StageScoreboard } from "../../components/StageScoreboard";
import { TRIVIA } from "../../config";
import type { TriviaState } from "../../lib/types";
import { findPlayer } from "../../lib/view";
import type { StageState } from "./types";

/** The context badge text for the top bar, per phase. */
function badgeFor(s: TriviaState): string {
  const { phase, round } = s.match;
  if (phase === "lobby") return "Lobby";
  if (phase === "languageVote") return "Match setup";
  if (phase === "scoreboard") return `After Round ${round}`;
  if (phase === "final") return "🏆 Final Results";
  return `Round ${round} / ${TRIVIA.rounds}`;
}

/** B1 — the persistent top bar (logo · context badge). The mute control is its own island. */
function TopBar({ s }: { s: TriviaState }) {
  return (
    <header data-region="top-bar">
      <span data-logo>
        trivia<b>.</b>
      </span>
      <span data-badge>{badgeFor(s)}</span>
    </header>
  );
}

/** Pick the screen body component for the current phase. */
function screenFor(state: StageState): JSX.Element {
  const { s, now, qr, code, endStats } = state;
  const phase = s.match.phase;
  if (phase === "lobby") return <StageLobby s={s} qr={qr} code={code} />;
  if (phase === "languageVote") return <StageLanguage s={s} now={now} />;
  if (phase === "categoryPick") return <StageCategory s={s} />;
  if (phase === "question") return <StageQuestion s={s} now={now} revealing={false} />;
  if (phase === "reveal") return <StageQuestion s={s} now={now} revealing />;
  if (phase === "scoreboard") return <StageScoreboard s={s} />;
  if (phase === "final") return <StagePodium s={s} endStats={endStats} />;
  return <StageLobby s={s} qr={qr} code={code} />;
}

/**
 * Render the whole TV/stage surface for the current snapshot.
 *
 * @param state - The current stage state.
 * @returns The stage view.
 * @example
 * ```ts
 * createIsland("stage", { render });
 * ```
 */
export function render(state: Readonly<StageState>): Spa.RenderResult {
  const { s } = state;
  const phase = s.match.phase;

  // The round-intro overlay is a full-stage takeover (covers the top bar).
  if (phase === "roundIntro") {
    const active = findPlayer(s.players, s.match.activePeer);
    return (
      <div data-stage data-phase={phase}>
        <RoundIntro
          round={s.match.round}
          total={TRIVIA.rounds}
          avatar={active?.avatar}
          name={active?.name}
          color={active?.color}
        />
      </div>
    );
  }

  return (
    <div data-stage data-phase={phase}>
      <TopBar s={s} />
      <div data-region="stage-body">{screenFor(state)}</div>
    </div>
  );
}
