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
  /**
   * Phone-clock time (ms) at which this phone's steal lead-in ends and the grid unlocks — set by the
   * controller lifecycle when it first sees the steal open (`Date.now() + stealLeadMs`). `null`/absent =
   * no active steal (or not yet anchored → treated as still arming, the safe default).
   */
  stealArmAt?: number | null | undefined;
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
  stealArmAt,
  onLock
}: PhoneAnswerProps): JSX.Element {
  const question = s.question;
  if (!question) return <PhoneWaitingCard emoji="⏳" title="Get ready…" />;

  const locked = lockedQid === question.id ? lockedSlot : null;
  const isSteal = question.mode === "steal";
  // Pre-steal lead-in: the grid renders on EVERY eligible phone but stays disabled through the "get ready"
  // beat, so no one taps before the others have rendered; it unlocks, then speed decides the reward.
  //
  // The phone times that beat on ITS OWN clock — a duration measured from when this phone first SAW the
  // steal open (`stealArmAt`, set by the controller lifecycle). It does NOT wait on the host's `armed`
  // sync frame (one best-effort frame; if it's lost on a real network the grid strands on "Get ready…"
  // until a reload — the reported steal-lock bug) NOR compare the host's absolute `armedTs` against this
  // phone's clock (the fast-tap skew bug). A local duration can't unlock EARLY: the phone only starts
  // counting once it has RECEIVED the open, so its countdown always ends a hair AFTER the host's — every
  // tap it can send lands inside the host's accept window. `null`/unset ⇒ still arming (the safe default).
  const notAnchored = stealArmAt === null || stealArmAt === undefined;
  const arming = isSteal && (notAnchored || now < stealArmAt);
  const leadSecs = notAnchored ? 0 : Math.max(0, Math.ceil((stealArmAt - now) / 1000));
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
