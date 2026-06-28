/**
 * @file controller island — the render layer: the phone frame (data-controller) + the per-phase/role
 * screen dispatch + the leave/mid-join modals. Builds the per-intent callbacks (closures over the live
 * state) and wires each to a bridge intent. DOM glue only — the phone reads slices + sends intents; the
 * host is authoritative. Switches on `match.phase` AND this phone's role (self vs activePeer/answeringPeer).
 */
import type { Spa } from "@moku-labs/web/browser";
import type { JSX } from "preact";
import { ClayButton } from "../../components/ClayButton";
import { DifficultyPips } from "../../components/DifficultyPips";
import { JoinWizard } from "../../components/JoinWizard";
import { LeaveModal } from "../../components/LeaveModal";
import { MidJoinModal } from "../../components/MidJoinModal";
import { PhoneAnswer } from "../../components/PhoneAnswer";
import { PhoneCategory } from "../../components/PhoneCategory";
import { PhoneFinal } from "../../components/PhoneFinal";
import { PhoneLanguageVote } from "../../components/PhoneLanguageVote";
import { PhoneWaitingCard } from "../../components/PhoneWaitingCard";
import { RevealFlash } from "../../components/RevealFlash";
import type { JoinProfile } from "../../components/types";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import { intent } from "../../lib/room";
import { sound } from "../../lib/sound";
import type { CategoryId, Lang, PlayerProfile, TriviaState } from "../../lib/types";
import { findPlayer } from "../../lib/view";
import { rememberIdentity } from "./profile";
import type { ControllerContext, ControllerState } from "./types";

/** The per-intent callbacks the phone screens fire (each wired to a bridge intent / local state). */
type ControllerHandlers = {
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

/** Build the per-intent callbacks (closures over the current island ctx + state). */
function makeHandlers(ctx: ControllerContext, state: ControllerState): ControllerHandlers {
  // Every handler is a user gesture, so each unlocks the AudioContext (browser autoplay policy) before
  // playing its confirmation SFX/haptic — the phone's tap feedback, paired with the engine mute gate.
  return {
    onJoin: profile => {
      // Persist the profile + a stable per-room token so a reload re-claims THIS seat (not a new
      // player), and send the token with the join so the host keys the roster slot on it.
      const playerToken = rememberIdentity(state.code, profile);
      intent("join-profile", { ...profile, playerToken });
      ctx.set({ joinedProfile: profile });
      sound.unlock();
      sound.play("join.confirm");
      sound.haptic("confirm");
    },
    onStartGame: () => {
      sound.unlock();
      sound.play("host.start");
      intent("start-game", {});
    },
    onVote: lang => {
      sound.unlock();
      sound.play("ui.tap");
      intent("language-vote", { lang });
    },
    onPickCategory: id => {
      // The TV plays category.chosen on the categoryReveal beat; the phone pick is a light tap confirm.
      sound.unlock();
      sound.play("ui.tap");
      intent("category-pick", { category: id as CategoryId });
    },
    onLock: slot => {
      sound.unlock();
      sound.play("phone.lockin");
      sound.haptic("lockin");
      intent("answer-lock", { slot });
      ctx.set({ lockedSlot: slot, lockedQid: state.s.question?.id ?? null });
    },
    onPlayAgain: () => {
      sound.unlock();
      sound.play("match.playagain");
      intent("play-again", {});
    },
    onLeaveOpen: () => {
      sound.play("ui.modal.open");
      ctx.set({ leaving: true });
    },
    onStay: () => {
      sound.play("ui.back");
      ctx.set({ leaving: false });
    },
    onLeave: () => {
      sound.play("ui.back");
      ctx.set({ leaving: false, left: true });
    }
  };
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

/** Pick the joined phone's screen for the current phase + role. */
function joinedScreen(
  state: ControllerState,
  self: PlayerProfile,
  handlers: ControllerHandlers
): JSX.Element {
  const { s } = state;
  const phase = s.match.phase;
  const isActive = s.match.activePeer === self.peerId;
  const isAnswering = s.question?.answeringPeer === self.peerId;
  const active = findPlayer(s.players, s.match.activePeer);

  if (phase === "lobby") {
    return (
      <PhoneWaitingCard
        emoji={self.avatar}
        title={self.name}
        subtitle={`Room ${state.code} · Player ${s.players.findIndex(p => p.peerId === self.peerId) + 1}`}
        color={self.color}
      >
        {self.isHost ? (
          <ClayButton tone="amber" onClick={handlers.onStartGame}>
            ▶ Start Game
          </ClayButton>
        ) : (
          <p data-wait-hint>Waiting for the host to start… ♪</p>
        )}
      </PhoneWaitingCard>
    );
  }
  if (phase === "languageVote") {
    return <PhoneLanguageVote s={s} now={state.now} onVote={handlers.onVote} />;
  }
  if (phase === "roundIntro") {
    return <PhoneWaitingCard emoji="✨" title={`Round ${s.match.round}`} subtitle="Get ready…" />;
  }
  if (phase === "categoryPick" || phase === "categoryReveal") {
    // During the reveal beat (phase="categoryReveal") the active player keeps the category list
    // visible with the chosen button lit + others faded (driven by match.chosenCategory); non-active
    // players keep the same "X is picking…" waiting card through the beat.
    return isActive ? (
      <PhoneCategory s={s} onPickCategory={handlers.onPickCategory} />
    ) : (
      <PhoneWaitingCard
        emoji={active?.avatar ?? "⏳"}
        title={`${active?.name ?? "Someone"} is picking…`}
        subtitle="Watch the TV!"
      />
    );
  }
  if (phase === "question") {
    return isAnswering ? (
      <PhoneAnswer
        s={s}
        now={state.now}
        lockedSlot={state.lockedSlot}
        lockedQid={state.lockedQid}
        onLock={handlers.onLock}
      />
    ) : (
      <PhoneWaitingCard
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
      <PhoneWaitingCard emoji="👀" title="Revealing…" subtitle="Watch the TV" />
    );
  }
  if (phase === "scoreboard") {
    return (
      <PhoneWaitingCard
        emoji="📊"
        title={`Round ${s.match.round} done`}
        subtitle="Next round soon ♪"
      >
        <DifficultyPips tier={ramp(s.match.round + 1)} />
      </PhoneWaitingCard>
    );
  }
  if (phase === "final") {
    return (
      <PhoneFinal s={s} onPlayAgain={handlers.onPlayAgain} onLeaveOpen={handlers.onLeaveOpen} />
    );
  }
  return <PhoneWaitingCard emoji="⏳" title="Waiting…" />;
}

/**
 * Render the whole phone/controller surface for the current snapshot + role.
 *
 * @param state - The current controller state.
 * @param ctx - The island context (for the per-intent callbacks).
 * @returns The controller view.
 * @example
 * ```ts
 * createIsland("controller", { render });
 * ```
 */
export function render(state: Readonly<ControllerState>, ctx: ControllerContext): Spa.RenderResult {
  const handlers = makeHandlers(ctx, state);
  const { s } = state;
  const self = findPlayer(s.players, s.self);

  if (state.left) {
    return (
      <div data-controller data-phase="final">
        <PhoneWaitingCard emoji="👋" title="You left the game" subtitle="Thanks for playing!" />
      </div>
    );
  }

  // Not yet on the roster: join wizard (lobby) or mid-join notice (match already running).
  if (!self) {
    if (s.match.phase !== "lobby" && state.joinedProfile === null) {
      return (
        <div data-controller data-phase={s.match.phase}>
          <MidJoinModal onDismiss={handlers.onStay} />
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
          onJoin={handlers.onJoin}
        />
      </div>
    );
  }

  const flash = s.match.phase === "reveal" ? flashFor(s) : null;
  const phaseAttr = flash ? "reveal" : s.match.phase;

  return (
    <div
      data-controller
      data-phase={phaseAttr}
      data-flash={flash ? (flash.correct ? "correct" : "wrong") : undefined}
    >
      {joinedScreen(state, self, handlers)}
      {state.leaving && <LeaveModal onStay={handlers.onStay} onLeave={handlers.onLeave} />}
    </div>
  );
}
