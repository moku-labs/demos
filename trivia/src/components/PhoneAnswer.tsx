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
  const isSteal = question.mode === "steal";
  // Pre-steal lead-in: the grid renders on EVERY eligible phone at the same time but stays disabled until
  // `armedTs`, so no device (the host's included) can tap before the others have rendered. It unlocks for
  // everyone together, then speed decides the reward.
  // `arming` gates on the host-authoritative `armed` boolean, NOT a compare of `armedTs` against this
  // phone's own clock (which drifts from the host's and let a fast phone tap into a window the host still
  // rejected — the "tap fast → not accepted" bug). `armedTs` drives only the cosmetic countdown below.
  const armedTs = s.steal.armedTs;
  const arming = isSteal && !s.steal.armed;
  const leadSecs = armedTs !== null ? Math.max(0, Math.ceil((armedTs - now) / 1000)) : 0;
  const totalMs = isSteal ? TRIVIA.timers.stealMs : TRIVIA.timers.answerMs;
  const pct = Math.max(0, Math.min(100, ((question.deadlineTs - now) / totalMs) * 100));

  const label = arming
    ? `Get ready to steal… ${leadSecs}`
    : isSteal
      ? "Steal it — tap fast!"
      : "Tap your answer";

  return (
    <div data-component="phone-answer" data-screen="answer" data-arming={arming ? true : undefined}>
      <span data-phone-label>{label}</span>
      <div data-answer-grid-phone>
        {question.options.map((_text, i) => {
          const { letter, shape, hex } = slotMeta(i);
          // During the lead-in every tile is disabled (dim); after it unlocks, normal idle/locked/dim.
          const stateAttr = arming
            ? "dim"
            : locked === null
              ? "idle"
              : locked === i
                ? "locked"
                : "dim";
          return (
            <AnswerButton
              key={letter}
              slotIndex={i}
              letter={letter}
              shape={shape}
              hex={hex}
              state={stateAttr}
              onPick={!arming && locked === null ? () => onLock(i) : undefined}
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
