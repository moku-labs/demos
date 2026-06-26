/**
 * @file ControllerView — the phone/controller render tree. A pure function of the merged snapshot + a
 * little UI-only state (the locked slot, the leave modal). Routes on `match.phase` AND this phone's role
 * (`self` vs `activePeer`/`answeringPeer`): join wizard A9 → waiting A10 → language vote → category pick
 * A11 → answer grid A12 → reveal flash A13/A14 → final card A15, plus the leave (E1) / mid-join (E2)
 * modals. DOM glue only — the phone only reads slices + sends intents; the host is authoritative.
 */
import type { JSX } from "preact";
import { AnswerButton } from "../../components/AnswerButton";
import { CategoryButton } from "../../components/CategoryButton";
import { ClayButton } from "../../components/ClayButton";
import { DifficultyPips } from "../../components/DifficultyPips";
import { JoinWizard } from "../../components/JoinWizard";
import { LeaveModal } from "../../components/LeaveModal";
import { MidJoinModal } from "../../components/MidJoinModal";
import { RevealFlash } from "../../components/RevealFlash";
import type { JoinProfile } from "../../components/types";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import { rank } from "../../lib/leaderboard";
import type { Lang, PlayerProfile, TriviaState } from "../../lib/types";
import { findPlayer, formatScore, secondsLeft, slotMeta } from "../../lib/view";

/** The controller island's per-instance state. */
export type ControllerState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** Ticking clock (ms) for the countdown bar. */
  now: number;
  /** The room code from the deep-link (shown on the "You're in!" card). */
  code: string;
  /** The profile this phone submitted (drives the "You're in!" confirmation pre-roster). */
  joinedProfile: JoinProfile | null;
  /** The slot this phone locked for the current question (`null` = not locked). */
  lockedSlot: number | null;
  /** The question id the lock applies to (so a new question clears the lock). */
  lockedQid: string | null;
  /** Whether the leave modal is open. */
  leaving: boolean;
  /** Whether this phone has left the game (terminal). */
  left: boolean;
};

/** Props for the top-level controller view — every callback is wired to a bridge intent in `index.ts`. */
export type ControllerViewProps = {
  state: ControllerState;
  onJoin: (profile: JoinProfile) => void;
  onStartGame: () => void;
  onVote: (lang: Lang) => void;
  onPickCategory: (id: string) => void;
  onLock: (slot: number) => void;
  onPlayAgain: () => void;
  onLeaveOpen: () => void;
  onStay: () => void;
  onLeave: () => void;
};

/** A simple centred waiting card reused across the phone's spectator phases. */
function WaitingCard({
  emoji,
  title,
  subtitle
}: {
  emoji: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div data-screen="waiting">
      <div data-wait-card>
        <span data-wait-emoji>{emoji}</span>
        <strong data-wait-title>{title}</strong>
        {subtitle && <span data-wait-sub>{subtitle}</span>}
      </div>
    </div>
  );
}

/** A10 — the waiting room (host sees Start; others wait). */
function WaitingRoom({ self, onStartGame }: { self: PlayerProfile; onStartGame: () => void }) {
  return (
    <div data-screen="waiting">
      <div data-wait-card style={{ "--player": self.color }}>
        <span data-wait-emoji>{self.avatar}</span>
        <strong data-wait-title style={{ color: self.color }}>
          {self.name}
        </strong>
        <span data-wait-sub>Room ready · {self.isHost ? "you're the host" : "Player"}</span>
      </div>
      {self.isHost ? (
        <ClayButton tone="amber" onClick={onStartGame}>
          ▶ Start Game
        </ClayButton>
      ) : (
        <p data-wait-hint>Waiting for the host to start… ♪</p>
      )}
    </div>
  );
}

/** The phone language vote — two big buttons + the current leader. */
function LanguageVotePhone({
  s,
  now,
  onVote
}: {
  s: TriviaState;
  now: number;
  onVote: (lang: Lang) => void;
}) {
  const secs = secondsLeft(s.languageVote.deadlineTs, now);
  return (
    <div data-screen="lang-vote">
      <h2 data-phone-title>Vote a language</h2>
      <div data-vote-buttons>
        <ClayButton tone="lemon" onClick={() => onVote("en")}>
          🇺🇸 English
        </ClayButton>
        <ClayButton tone="sky" onClick={() => onVote("ru")}>
          🇷🇺 Русский
        </ClayButton>
      </div>
      <p data-wait-hint>
        Leading: {s.languageVote.leading === "ru" ? "Русский" : "English"} · {secs}s
      </p>
    </div>
  );
}

/** A11 — the active player's category list. */
function CategoryList({
  s,
  onPickCategory
}: {
  s: TriviaState;
  onPickCategory: (id: string) => void;
}) {
  const self = findPlayer(s.players, s.self);
  return (
    <div data-screen="category-pick">
      <h2 data-phone-title>
        Your turn to pick, {self?.avatar} {self?.name}!
      </h2>
      <div data-category-list>
        {TRIVIA.categories.map(category => (
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

/** A12 — the phone answer grid (colour+shape+letter only). */
function AnswerGridPhone({
  state,
  onLock
}: {
  state: ControllerState;
  onLock: (slot: number) => void;
}) {
  const { s, now } = state;
  const question = s.question;
  if (!question) return <WaitingCard emoji="⏳" title="Get ready…" />;

  const locked = state.lockedQid === question.id ? state.lockedSlot : null;
  const totalMs = question.mode === "steal" ? TRIVIA.timers.stealMs : TRIVIA.timers.answerMs;
  const pct = Math.max(0, Math.min(100, ((question.deadlineTs - now) / totalMs) * 100));

  return (
    <div data-screen="answer">
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

/** Whether this phone should see the reveal flash, and with what payload. */
function flashFor(s: TriviaState): { correct: boolean; points: number } | null {
  const self = s.self;
  if (self === null || !s.question) return null;
  if (s.question.answeringPeer !== self) return null;
  const correct = s.reveal.outcome === "correct" || s.reveal.outcome === "stolen";
  const points = s.scores.find(e => e.peerId === self)?.delta ?? 0;
  return { correct, points };
}

/** A15 — the phone final result card. */
function FinalCard({
  s,
  onPlayAgain,
  onLeaveOpen
}: {
  s: TriviaState;
  onPlayAgain: () => void;
  onLeaveOpen: () => void;
}) {
  const self = findPlayer(s.players, s.self);
  const ranked = rank(s.scores);
  const entry = ranked.find(e => e.peerId === s.self);
  const place = entry?.rank ?? ranked.length;
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "🎖";
  const ordinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;

  return (
    <div data-screen="final">
      <div data-final-card style={{ "--player": self?.color ?? "#fff" }}>
        <span data-final-medal>{medal}</span>
        <strong data-final-place>
          You came {ordinal}! {self?.avatar}
        </strong>
        <span data-final-score style={{ color: self?.color ?? "#fff" }}>
          {formatScore(entry?.total ?? 0)} pts
        </span>
      </div>
      <div data-final-actions>
        <ClayButton tone="lemon" onClick={onPlayAgain}>
          ↩ Play Again
        </ClayButton>
        <ClayButton tone="ghost" onClick={onLeaveOpen}>
          Leave
        </ClayButton>
      </div>
    </div>
  );
}

/** Pick the joined phone's screen for the current phase + role. */
function joinedScreen(props: ControllerViewProps, self: PlayerProfile): JSX.Element {
  const { state, onStartGame, onVote, onPickCategory, onLock, onPlayAgain, onLeaveOpen } = props;
  const { s } = state;
  const phase = s.match.phase;
  const isActive = s.match.activePeer === self.peerId;
  const isAnswering = s.question?.answeringPeer === self.peerId;
  const active = findPlayer(s.players, s.match.activePeer);

  if (phase === "lobby") return <WaitingRoom self={self} onStartGame={onStartGame} />;
  if (phase === "languageVote") return <LanguageVotePhone s={s} now={state.now} onVote={onVote} />;
  if (phase === "roundIntro") {
    return <WaitingCard emoji="✨" title={`Round ${s.match.round}`} subtitle="Get ready…" />;
  }
  if (phase === "categoryPick") {
    return isActive ? (
      <CategoryList s={s} onPickCategory={onPickCategory} />
    ) : (
      <WaitingCard
        emoji={active?.avatar ?? "⏳"}
        title={`${active?.name ?? "Someone"} is picking…`}
        subtitle="Watch the TV!"
      />
    );
  }
  if (phase === "question") {
    return isAnswering ? (
      <AnswerGridPhone state={state} onLock={onLock} />
    ) : (
      <WaitingCard
        emoji={findPlayer(s.players, s.question?.answeringPeer)?.avatar ?? "👀"}
        title={`${findPlayer(s.players, s.question?.answeringPeer)?.name ?? "Someone"} is answering`}
        subtitle="Watch the TV — you might steal it!"
      />
    );
  }
  if (phase === "reveal") {
    const flash = flashFor(s);
    return flash ? (
      <RevealFlash correct={flash.correct} points={flash.points} />
    ) : (
      <WaitingCard emoji="👀" title="Revealing…" subtitle="Watch the TV" />
    );
  }
  if (phase === "scoreboard") {
    return (
      <div data-screen="between">
        <WaitingCard
          emoji="📊"
          title={`Round ${s.match.round} done`}
          subtitle="Next round soon ♪"
        />
        <DifficultyPips tier={ramp(s.match.round + 1)} />
      </div>
    );
  }
  if (phase === "final")
    return <FinalCard s={s} onPlayAgain={onPlayAgain} onLeaveOpen={onLeaveOpen} />;
  return <WaitingCard emoji="⏳" title="Waiting…" />;
}

/**
 * Render the whole phone/controller surface for the current snapshot + role.
 *
 * @param props - The island state + the per-intent callbacks.
 * @returns The controller view.
 * @example
 * ```tsx
 * <ControllerView state={state} onJoin={join} onLock={lock} … />
 * ```
 */
export function ControllerView(props: ControllerViewProps): JSX.Element {
  const { state, onJoin, onStay, onLeave } = props;
  const { s } = state;
  const self = findPlayer(s.players, s.self);

  if (state.left) {
    return (
      <div data-controller data-phase="final">
        <WaitingCard emoji="👋" title="You left the game" subtitle="Thanks for playing!" />
      </div>
    );
  }

  // Not yet on the roster: join wizard (lobby) or mid-join notice (match already running).
  if (!self) {
    if (s.match.phase !== "lobby" && state.joinedProfile === null) {
      return (
        <div data-controller data-phase={s.match.phase}>
          <MidJoinModal onDismiss={onStay} />
        </div>
      );
    }
    return (
      <div data-controller data-phase="join">
        <JoinWizard
          avatars={TRIVIA.avatars}
          colors={TRIVIA.playerColors}
          takenColors={s.players.map(p => p.color)}
          roomCode={state.code}
          joined={state.joinedProfile !== null}
          joinedAvatar={state.joinedProfile?.avatar}
          joinedColor={state.joinedProfile?.color}
          onJoin={onJoin}
        />
      </div>
    );
  }

  const flash = s.match.phase === "reveal" ? flashFor(s) : null;
  const phaseAttr = flash ? (flash.correct ? "reveal" : "reveal") : s.match.phase;

  return (
    <div
      data-controller
      data-phase={phaseAttr}
      data-flash={flash ? (flash.correct ? "correct" : "wrong") : undefined}
    >
      {joinedScreen(props, self)}
      {state.leaving && <LeaveModal onStay={onStay} onLeave={onLeave} />}
    </div>
  );
}
