/**
 * @file StageQuestion — the TV question screen (A4/A5) and its in-place reveal (A6). A pure presentational
 * component fed the snapshot + the ticking `now` + a `revealing` flag; the same 2×2 grid resolves in place
 * at reveal (correct/wrong/dim) and a score rollup slides in. Rendered by the stage island's render layer
 * for `phase === "question"` (revealing=false) and `phase === "reveal"` (revealing=true).
 */
import type { JSX } from "preact";
import { TRIVIA } from "../config";
import { rank } from "../lib/leaderboard";
import type { PlayerProfile, QuestionView, RevealView, TriviaState } from "../lib/types";
import { categoryMeta, findPlayer, secondsLeft, slotMeta } from "../lib/view";
import { AnswerTile } from "./AnswerTile";
import { DifficultyPips } from "./DifficultyPips";
import { Flag } from "./Flag";
import { ScoreChip } from "./ScoreChip";
import { TimerRing } from "./TimerRing";
import { TurnChip } from "./TurnChip";

/** Props for the question screen. */
export type StageQuestionProps = {
  /** The merged synced snapshot (question + reveal + scores + players). */
  s: TriviaState;
  /** The ticking clock (ms) so the timer ring re-renders. */
  now: number;
  /** Whether this is the in-place reveal (A6) rather than the live question (A4/A5). */
  revealing: boolean;
};

/** The 2×2 answer grid, shared by the question + reveal screens (resolves in place at reveal). */
function AnswerGrid({
  question,
  reveal,
  answererName
}: {
  question: QuestionView;
  reveal: RevealView | null;
  answererName: string;
}) {
  return (
    <div data-answer-grid>
      {question.options.map((text, i) => {
        const { letter, shape, hex } = slotMeta(i);
        let stateAttr: "idle" | "correct" | "dim" | "wrong" = "idle";
        let tag: string | undefined;
        if (reveal) {
          if (i === reveal.correctSlot) {
            stateAttr = "correct";
            tag = "✓ CORRECT";
          } else if (reveal.pickedSlot === i) {
            stateAttr = "wrong";
            tag = `✗ ${answererName}`;
          } else {
            stateAttr = "dim";
          }
        }
        return (
          <AnswerTile
            key={letter}
            slotIndex={i}
            letter={letter}
            shape={shape}
            hex={hex}
            text={text}
            state={stateAttr}
            tag={tag}
          />
        );
      })}
    </div>
  );
}

/** The reveal outcome chip + answer-line copy (F14), derived from the reveal slice. */
function revealCopy(
  reveal: RevealView,
  scorer: PlayerProfile | undefined,
  answerer: PlayerProfile | undefined,
  delta: number
): { chip: string; tone: "correct" | "wrong"; line: string } {
  const name = scorer?.name ?? answerer?.name ?? "Player";
  if (reveal.outcome === "correct") {
    return {
      chip: `${name} — Correct! +${delta}`,
      tone: "correct",
      line: `✅ ${reveal.answerText} — ${name} nailed it!`
    };
  }
  if (reveal.outcome === "stolen") {
    return {
      chip: `${name} steals it! +${delta}`,
      tone: "correct",
      line: `✅ ${reveal.answerText} — ${name} stole the points!`
    };
  }
  if (reveal.outcome === "wrong") {
    return {
      chip: `${answerer?.name ?? "Player"} — Wrong`,
      tone: "wrong",
      line: `✅ The answer was ${reveal.answerText}`
    };
  }
  return {
    chip: "Time's up — no answer",
    tone: "wrong",
    line: `✅ The answer was ${reveal.answerText}`
  };
}

/** F1 — the steal strip (slides in when a steal opens). */
function StealStrip({ s, now }: { s: TriviaState; now: number }) {
  const active = findPlayer(s.players, s.match.activePeer);
  const stealer = findPlayer(s.players, s.steal.stealPeer);
  const secs = secondsLeft(s.steal.deadlineTs, now);
  return (
    <div data-steal-strip>
      <span data-steal-text>
        → {active?.name ?? "Player"} missed — passing to {stealer?.avatar ?? "•"}{" "}
        {stealer?.name ?? "next"} to steal
      </span>
      <span data-steal-chip style={{ "--player": stealer?.color ?? "#14b8a6" }}>
        {stealer?.avatar ?? "•"} {stealer?.name ?? "next"} · {secs}s
      </span>
    </div>
  );
}

/**
 * Render the TV question screen (and its in-place reveal): the meta bar (category + answerer/scorer chip),
 * the prompt hero, the timer ring (question only), the 2×2 answer grid, the steal strip, and the reveal
 * score rollup.
 *
 * @param props - The question screen props.
 * @returns The question screen.
 * @example
 * ```tsx
 * <StageQuestion s={s} now={now} revealing={false} />
 * ```
 */
export function StageQuestion({ s, now, revealing }: StageQuestionProps): JSX.Element {
  const question = s.question;
  if (!question) return <div data-component="stage-question" data-screen="question" />;

  const meta = categoryMeta(question.category);
  const answerer = findPlayer(s.players, question.answeringPeer);
  const scorer = findPlayer(s.players, s.reveal.scorerPeer);
  const totalMs = question.mode === "steal" ? TRIVIA.timers.stealMs : TRIVIA.timers.answerMs;
  const remainingMs = Math.max(0, question.deadlineTs - now);
  const scorerDelta = s.scores.find(e => e.peerId === s.reveal.scorerPeer)?.delta ?? 0;
  const copy = revealing ? revealCopy(s.reveal, scorer, answerer, scorerDelta) : null;

  return (
    <div data-component="stage-question" data-screen="question">
      <div data-meta-bar>
        <span data-category-tag>
          <span data-emoji>{meta.emoji}</span>
          <span>{meta.name}</span>
          <DifficultyPips tier={question.tier} />
        </span>
        {copy ? (
          <TurnChip
            avatar={(scorer ?? answerer)?.avatar ?? "•"}
            name={(scorer ?? answerer)?.name ?? ""}
            color={(scorer ?? answerer)?.color ?? "#fff"}
            label={copy.chip}
            tone={copy.tone}
          />
        ) : (
          <TurnChip
            avatar={answerer?.avatar ?? "•"}
            name={answerer?.name ?? ""}
            color={answerer?.color ?? "#fff"}
            label="answering"
          />
        )}
      </div>

      <div data-hero>
        {question.type === "image" && (
          <div data-hero-image>
            <Flag code={(question.imageUrl?.replace("flag:", "") as "us" | "ru" | "bd") ?? "bd"} />
          </div>
        )}
        <p data-prompt>{question.prompt}</p>
        {copy && <p data-answer-line>{copy.line}</p>}
      </div>

      {!revealing && (
        <div data-timer>
          <TimerRing remainingMs={remainingMs} totalMs={totalMs} />
        </div>
      )}

      <AnswerGrid
        question={question}
        reveal={revealing ? s.reveal : null}
        answererName={answerer?.name ?? ""}
      />

      {s.steal.active && !revealing && <StealStrip s={s} now={now} />}

      {revealing && (
        <div data-score-rollup>
          {rank(s.scores).map(entry => {
            const player = findPlayer(s.players, entry.peerId);
            if (!player) return null;
            return (
              <ScoreChip
                key={entry.peerId}
                name={player.name}
                color={player.color}
                total={entry.total}
                delta={entry.delta}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
