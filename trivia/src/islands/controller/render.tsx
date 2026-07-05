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
import { PhoneConnectionBanner } from "../../components/PhoneConnectionBanner";
import { PhoneFinal } from "../../components/PhoneFinal";
import { PhoneLanguageVote } from "../../components/PhoneLanguageVote";
import { PhoneWaitingCard } from "../../components/PhoneWaitingCard";
import { RevealFlash } from "../../components/RevealFlash";
import type { JoinProfile } from "../../components/types";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import { intent, retryConnection } from "../../lib/room";
import { sound } from "../../lib/sound";
import type { CategoryId, Lang, PlayerProfile, TriviaState } from "../../lib/types";
import { connectedPlayerCount, findPlayer } from "../../lib/view";
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
      // Keep the token in island state too: the join self-heal re-sends from here, so a phone whose
      // localStorage persist failed (private mode) still re-claims with the SAME token it first sent.
      ctx.set({ joinedProfile: profile, joinToken: playerToken });
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
      // No live question, no lock (unreachable from the grid, which only renders with a question).
      const qid = state.s.question?.id;
      if (!qid) return;
      sound.unlock();
      sound.play("phone.lockin");
      sound.haptic("lockin");
      // The lock is pinned to the question the player saw (`qid` — the host drops any other), so the
      // optimistic UI lock (tiles disable now, before any host ack) is safe: the wire's at-least-once
      // delivery (room ≥0.4.0 retransmit-until-ack) re-sends a dropped frame, and a late duplicate
      // can never resolve a different question.
      intent("answer-lock", { slot, qid });
      ctx.set({ lockedSlot: slot, lockedQid: qid });
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
      // Tell the host to drop our seat for good BEFORE we tear down our local view, so we never linger
      // as a ghost tile in the next lobby (bug #5). Then show the "You left" card.
      intent("leave-game", {});
      ctx.set({ leaving: false, left: true });
    }
  };
}

/**
 * Whether this phone should see the reveal flash, and with what payload. In the OPEN steal, the
 * original answerer is no longer the only participant: the WINNER is `reveal.scorerPeer` (correct
 * flash), the active player who missed gets a wrong flash, and any stealer who locked an answer but
 * didn't win also gets a wrong flash. Pure watchers (who never locked) see no flash.
 *
 * @param s - The merged snapshot.
 * @param lockedQid - The question id this phone locked an answer for this round (`null` = never locked).
 * @returns The flash payload, or `null` when this phone should not flash.
 */
function flashFor(
  s: TriviaState,
  lockedQid: string | null
): { correct: boolean; points: number } | null {
  const self = s.self;
  if (self === null || !s.question) return null;

  const myDelta = s.scores.find(e => e.peerId === self)?.delta ?? 0;

  // The primary scorer (active-correct or the FASTEST stealer) → correct flash with their round points.
  if (s.reveal.scorerPeer === self) return { correct: true, points: myDelta };

  // Any other stealer who took a crack: correct flash (they still scored, just not fastest) or wrong flash.
  const mySteal = s.reveal.stealResults.find(result => result.peerId === self);
  if (mySteal) return { correct: mySteal.correct, points: mySteal.correct ? myDelta : 0 };

  // The original active answerer who missed → wrong flash.
  if (s.question.answeringPeer === self) return { correct: false, points: 0 };
  // A stealer who locked an answer this question but isn't in the results yet → wrong flash.
  if (lockedQid !== null && lockedQid === s.question.id) return { correct: false, points: 0 };

  return null;
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
  const question = s.question;
  // Who may tap an answer now: in answer mode only the active answerer; in an OPEN steal every eligible
  // (non-active, not-yet-tried) stealer — so all of them get the grid at once, not one after another.
  const canAnswer = question
    ? question.mode === "steal"
      ? s.steal.active && s.steal.stealPeers.includes(self.peerId)
      : question.answeringPeer === self.peerId
    : false;
  const inOpenSteal = !!question && question.mode === "steal" && s.steal.active;
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
    // Lead with the active player's avatar (the round's picker), so this beat reads like the other
    // watcher cards (avatar + status) instead of a generic sparkle.
    return (
      <PhoneWaitingCard
        emoji={active?.avatar ?? "🎯"}
        title={`Round ${s.match.round}`}
        subtitle="Get ready…"
      />
    );
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
    if (canAnswer) {
      return (
        <PhoneAnswer
          s={s}
          now={state.now}
          lockedSlot={state.lockedSlot}
          lockedQid={state.lockedQid}
          stealArmAt={state.stealArmAt}
          onLock={handlers.onLock}
        />
      );
    }
    // Open steal in progress, but this phone can't answer (the active player who missed, or a stealer
    // who already tried) → a "steal in progress" watch card rather than the "X is answering" one.
    if (inOpenSteal) {
      return (
        <PhoneWaitingCard
          emoji="🔥"
          title="Steal in progress!"
          subtitle="Watch the TV — first wins ♪"
        />
      );
    }
    return (
      <PhoneWaitingCard
        emoji={findPlayer(s.players, s.question?.answeringPeer)?.avatar ?? "👀"}
        title={`${findPlayer(s.players, s.question?.answeringPeer)?.name ?? "Someone"} is answering`}
        subtitle="Watch the TV — you might steal it!"
      />
    );
  }
  if (phase === "reveal") {
    const flash = flashFor(s, state.lockedQid);
    if (flash) return <RevealFlash correct={flash.correct} points={flash.points} />;
    // Watcher view: keep the answerer's avatar (carried from "{name} is answering") so the reveal beat
    // matches the other watcher cards instead of a skewed pair of eyes.
    const answerer = findPlayer(s.players, s.question?.answeringPeer);
    return (
      <PhoneWaitingCard
        emoji={answerer?.avatar ?? "🔎"}
        title="Revealing…"
        subtitle="Watch the TV"
      />
    );
  }
  if (phase === "scoreboard") {
    return (
      <PhoneWaitingCard
        emoji="📊"
        title={`Round ${s.match.round} done`}
        subtitle="Next round soon ♪"
      >
        <DifficultyPips
          tier={ramp(s.match.round + 1, connectedPlayerCount(s.players), s.match.totalRounds)}
        />
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
  // Item 4 (connectivity audit): the phone's own connection-lost/reconnecting banner overlays
  // WHATEVER screen it lost the link on — never a silent stale screen. Rendered on every branch below.
  const connectionBanner =
    state.connection === "ok" ? null : (
      <PhoneConnectionBanner
        retrying={state.connection === "reconnecting"}
        onRetry={retryConnection}
      />
    );

  if (state.left) {
    return (
      <div data-controller data-phase="final">
        <PhoneWaitingCard emoji="👋" title="You left the game" subtitle="Thanks for playing!" />
        {connectionBanner}
      </div>
    );
  }

  // Not yet on the roster: join wizard (lobby) or mid-join notice (match already running).
  if (!self) {
    if (s.match.phase !== "lobby" && state.joinedProfile === null) {
      return (
        <div data-controller data-phase={s.match.phase}>
          <MidJoinModal onDismiss={handlers.onStay} />
          {connectionBanner}
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
          submitted={state.joinedProfile !== null}
          joinedAvatar={state.joinedProfile?.avatar}
          joinedColor={state.joinedProfile?.color}
          onJoin={handlers.onJoin}
        />
        {connectionBanner}
      </div>
    );
  }

  const flash = s.match.phase === "reveal" ? flashFor(s, state.lockedQid) : null;
  const phaseAttr = flash ? "reveal" : s.match.phase;

  return (
    <div
      data-controller
      data-phase={phaseAttr}
      data-flash={flash ? (flash.correct ? "correct" : "wrong") : undefined}
    >
      {joinedScreen(state, self, handlers)}
      {state.leaving && <LeaveModal onStay={handlers.onStay} onLeave={handlers.onLeave} />}
      {connectionBanner}
    </div>
  );
}
