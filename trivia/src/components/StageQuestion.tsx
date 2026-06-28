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
import { useFitText } from "./use-fit-text";

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
      // TurnChip already renders [data-name]; the label is the STATUS only — no name prefix.
      chip: `— Correct! +${delta}`,
      tone: "correct",
      line: `✅ ${reveal.answerText} — ${name} nailed it!`
    };
  }
  if (reveal.outcome === "stolen") {
    return {
      // TurnChip already renders [data-name]; the label is the STATUS only — no name prefix.
      chip: `steals it! +${delta}`,
      tone: "correct",
      line: `✅ ${reveal.answerText} — ${name} stole the points!`
    };
  }
  if (reveal.outcome === "wrong") {
    return {
      // TurnChip already renders [data-name]; the label is the STATUS only — no name prefix.
      chip: "— Wrong",
      tone: "wrong",
      line: `✅ The answer was ${reveal.answerText}`
    };
  }
  return {
    chip: "⏱ Time's up — no answer",
    tone: "wrong",
    line: `✅ The answer was ${reveal.answerText}`
  };
}

/** F1 — the OPEN steal strip: the active player missed, so everyone else may steal at once. */
function StealStrip({ s, now }: { s: TriviaState; now: number }) {
  const active = findPlayer(s.players, s.match.activePeer);
  const eligible = s.steal.stealPeers
    .map(id => findPlayer(s.players, id))
    .filter((p): p is PlayerProfile => p !== undefined);
  const secs = secondsLeft(s.steal.deadlineTs, now);
  const stealPct = Math.max(0, Math.min(100, (secs / (TRIVIA.timers.stealMs / 1000)) * 100));
  return (
    // aria-live: a steal opening is a critical game-state change — announce it to screen readers (the
    // strip only mounts when the steal is active), since the TV is otherwise silent (WCAG 4.1.3).
    <div data-steal-strip role="status" aria-live="polite">
      <span data-steal-text>
        → {active?.name ?? "Player"} missed — everyone can steal! Tap fast ♪
      </span>
      <span data-steal-eligible>
        {eligible.map(p => (
          <span key={p.peerId} data-steal-avatar style={{ "--player": p.color }} title={p.name}>
            {p.avatar}
          </span>
        ))}
        <span data-steal-secs>{secs}s</span>
      </span>
      <span data-steal-timer-bar aria-hidden="true">
        <span data-steal-timer-fill style={{ width: `${stealPct}%` }} />
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
  // Auto-fit the prompt to its box (declared before the early return to honour the rules of hooks).
  const { boxReference, textReference } = useFitText<HTMLDivElement, HTMLParagraphElement>(
    question?.prompt ?? ""
  );
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

      <div data-hero data-image={question.type === "image" ? true : undefined}>
        {question.type === "image" && (
          <div data-hero-image>
            <Flag code={(question.imageUrl?.replace("flag:", "") as "us" | "ru" | "bd") ?? "bd"} />
          </div>
        )}
        <div data-prompt-fit ref={boxReference}>
          <p data-prompt ref={textReference}>
            {question.prompt}
          </p>
        </div>
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
        <div data-score-rollup role="status" aria-label="Score update">
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
