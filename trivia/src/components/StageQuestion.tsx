/**
 * @file StageQuestion — the TV question screen (A4/A5) and its in-place reveal (A6). A pure presentational
 * component fed the snapshot + the ticking `now` + a `revealing` flag; the same 2×2 grid resolves in place
 * at reveal (correct/wrong/dim, tagged with WHO picked each option) and ONE combined reveal panel (item 1)
 * shows who answered what, their answer time, points gained, and who was fastest — replacing the separate
 * steal-results strip + score rollup that used to stack independently. Rendered by the stage island's
 * render layer for `phase === "question"` (revealing=false) and `phase === "reveal"`.
 */
import type { JSX } from "preact";
import { TRIVIA } from "../config";
import type { PlayerProfile, QuestionView, RevealView, TriviaState } from "../lib/types";
import { categoryMeta, findPlayer, secondsLeft, slotMeta } from "../lib/view";
import { AnswerTile } from "./AnswerTile";
import { DifficultyPips } from "./DifficultyPips";
import { Flag } from "./Flag";
import { RevealPanel } from "./RevealPanel";
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

/** One player's pick on the reveal grid (who chose which slot, and whether it was right). */
type RevealPick = { peerId: string; slot: number; correct: boolean };

/**
 * Collect every player's pick for the reveal grid: the active player's own pick (unless they timed out)
 * plus every open-steal answer. Drives the per-slot "who picked this" name tags.
 *
 * @param s - The merged snapshot.
 * @returns The picks (active first, then stealers in speed order).
 */
function collectRevealPicks(s: TriviaState): RevealPick[] {
  const picks: RevealPick[] = [];
  const activePeer = s.question?.answeringPeer ?? null;
  const { pickedSlot, correctSlot, stealResults } = s.reveal;
  if (activePeer !== null && pickedSlot !== null && pickedSlot >= 0) {
    picks.push({ peerId: activePeer, slot: pickedSlot, correct: pickedSlot === correctSlot });
  }
  for (const result of stealResults) {
    picks.push({ peerId: result.peerId, slot: result.slot, correct: result.correct });
  }
  return picks;
}

/** The 2×2 answer grid, shared by the question + reveal screens (resolves in place at reveal). */
function AnswerGrid({
  question,
  reveal,
  picks,
  players
}: {
  question: QuestionView;
  reveal: RevealView | null;
  picks: RevealPick[];
  players: PlayerProfile[];
}) {
  return (
    <div data-answer-grid>
      {question.options.map((text, i) => {
        const { letter, shape, hex } = slotMeta(i);
        let stateAttr: "idle" | "correct" | "dim" | "wrong" = "idle";
        let tag: string | undefined;
        if (reveal) {
          const names = picks
            .filter(pick => pick.slot === i)
            .map(pick => findPlayer(players, pick.peerId)?.name)
            .filter((name): name is string => Boolean(name));
          const who = names.join(", ");
          // Name the pickers on the correct tile ONLY in a multi-player open steal (so the solo-answer
          // reveal keeps the clean "✓ CORRECT"); wrong tiles always name who picked them.
          const isSteal = reveal.stealResults.length > 0;
          if (i === reveal.correctSlot) {
            stateAttr = "correct";
            tag = isSteal && who ? `✓ ${who}` : "✓ CORRECT";
          } else if (names.length > 0) {
            stateAttr = "wrong";
            tag = `✗ ${who}`;
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
    const stealers = reveal.stealResults.filter(result => result.correct).length;
    return {
      // TurnChip already renders [data-name]; the label is the STATUS only — no name prefix.
      chip: stealers > 1 ? `fastest steal! +${delta}` : `steals it! +${delta}`,
      tone: "correct",
      line: `✅ ${reveal.answerText} — ${name} was fastest!`
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
  const answered = new Set(s.steal.answeredPeers);
  const eligible = s.steal.stealPeers
    .map(id => findPlayer(s.players, id))
    .filter((p): p is PlayerProfile => p !== undefined);
  // Lead-in gate: the grid on every phone is disabled until `armedTs`, so the strip counts that "get
  // ready" beat down first, then flips to the live steal window (fairness — no device answers first).
  // Gate on the host-authoritative `armed` boolean (the strip only mounts while the steal is active, so
  // `!armed` === still in the lead-in) — consistent with the phone + host, not a local wall-clock compare.
  const armedTs = s.steal.armedTs;
  const arming = !s.steal.armed;
  const leadSecs = armedTs !== null ? Math.max(0, Math.ceil((armedTs - now) / 1000)) : 0;
  const secs = secondsLeft(s.steal.deadlineTs, now);
  const stealPct = Math.max(0, Math.min(100, (secs / (TRIVIA.timers.stealMs / 1000)) * 100));
  return (
    // aria-live: a steal opening is a critical game-state change — announce it to screen readers (the
    // strip only mounts when the steal is active), since the TV is otherwise silent (WCAG 4.1.3).
    <div data-steal-strip data-arming={arming ? true : undefined} role="status" aria-live="polite">
      <span data-steal-text>
        {arming
          ? `→ ${active?.name ?? "Player"} missed — get ready to steal! ${leadSecs}`
          : `→ Everyone steal — all correct score, fastest wins most! (${answered.size}/${eligible.length} in)`}
      </span>
      <span data-steal-eligible>
        {eligible.map(p => (
          <span
            key={p.peerId}
            data-steal-avatar
            data-answered={answered.has(p.peerId) ? true : undefined}
            style={{ "--player": p.color }}
            title={p.name}
          >
            {p.avatar}
          </span>
        ))}
        {!arming ? <span data-steal-secs>{secs}s</span> : null}
      </span>
      <span data-steal-timer-bar aria-hidden="true">
        <span data-steal-timer-fill style={{ width: `${arming ? 100 : stealPct}%` }} />
      </span>
    </div>
  );
}

/**
 * Render the TV question screen (and its in-place reveal): the meta bar (category + answerer/scorer chip),
 * the prompt hero, the timer ring (question only), the 2×2 answer grid (tagged with who picked what at
 * reveal), the steal strip, and ONE combined reveal panel (item 1 — who answered what, answer times,
 * points, and who was fastest).
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
  const picks = revealing ? collectRevealPicks(s) : [];

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
        picks={picks}
        players={s.players}
      />

      {s.steal.active && !revealing && <StealStrip s={s} now={now} />}

      {revealing && <RevealPanel s={s} />}
    </div>
  );
}
