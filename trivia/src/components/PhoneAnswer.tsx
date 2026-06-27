/**
 * @file PhoneAnswer — the answerer's phone answer grid (A12): colour+shape+letter buttons + a countdown
 * bar. The locked slot stays highlighted while the others dim; each tap sends an `answer-lock` intent
 * (wired by the controller island). Rendered for the answering phone in the `question` phase.
 */
import type { JSX } from "preact";
import { TRIVIA } from "../config";
import type { TriviaState } from "../lib/types";
import { slotMeta } from "../lib/view";
import { AnswerButton } from "./AnswerButton";
import { PhoneWaitingCard } from "./PhoneWaitingCard";

/** Props for the phone answer grid. */
export type PhoneAnswerProps = {
  /** The merged synced snapshot (question state). */
  s: TriviaState;
  /** The ticking clock (ms) so the countdown bar re-renders. */
  now: number;
  /** The slot this phone locked for the current question (`null` = not locked). */
  lockedSlot: number | null;
  /** The question id the lock applies to (so a new question clears the lock). */
  lockedQid: string | null;
  /** Lock an answer slot. */
  onLock: (slot: number) => void;
};

/**
 * Render the answerer's phone answer grid — the four slot buttons + the countdown bar (or a "Get ready"
 * card before the question publishes).
 *
 * @param props - The answer grid props.
 * @returns The answer grid screen.
 * @example
 * ```tsx
 * <PhoneAnswer s={s} now={now} lockedSlot={lockedSlot} lockedQid={lockedQid} onLock={onLock} />
 * ```
 */
export function PhoneAnswer({
  s,
  now,
  lockedSlot,
  lockedQid,
  onLock
}: PhoneAnswerProps): JSX.Element {
  const question = s.question;
  if (!question) return <PhoneWaitingCard emoji="⏳" title="Get ready…" />;

  const locked = lockedQid === question.id ? lockedSlot : null;
  const totalMs = question.mode === "steal" ? TRIVIA.timers.stealMs : TRIVIA.timers.answerMs;
  const pct = Math.max(0, Math.min(100, ((question.deadlineTs - now) / totalMs) * 100));

  return (
    <div data-component="phone-answer" data-screen="answer">
      <span data-phone-label>
        {question.mode === "steal" ? "Steal it — tap fast!" : "Tap your answer"}
      </span>
      <div data-answer-grid-phone>
        {question.options.map((_text, i) => {
          const { letter, shape, hex } = slotMeta(i);
          const stateAttr = locked === null ? "idle" : locked === i ? "locked" : "dim";
          return (
            <AnswerButton
              key={letter}
              slotIndex={i}
              letter={letter}
              shape={shape}
              hex={hex}
              state={stateAttr}
              onPick={locked === null ? () => onLock(i) : undefined}
            />
          );
        })}
      </div>
      <div data-countdown>
        <div data-fill style={{ width: `${pct}%` }} data-low={pct < 25 ? "true" : undefined} />
      </div>
    </div>
  );
}
