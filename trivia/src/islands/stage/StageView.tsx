/**
 * @file StageView — the TV/shared-screen render tree. A pure function of the merged bridge snapshot +
 * a little UI-only state (mute, qr, the live `now` for timers). Routes on `match.phase` to the eight
 * screens (lobby A1 → language A2 → round intro C1 → category A3 → question A4/A5 → reveal A6 →
 * scoreboard A7 → podium A8), with the persistent top bar B1 and the transient overlays/popups on top.
 * DOM glue only — all game logic is host-side in the room plugins.
 */
import type { QrMatrix } from "@moku-labs/room";
import type { JSX } from "preact";
import { AnswerTile } from "../../components/AnswerTile/AnswerTile";
import { CategoryCard } from "../../components/CategoryCard/CategoryCard";
import { Confetti } from "../../components/Confetti/Confetti";
import { DifficultyPips } from "../../components/DifficultyPips/DifficultyPips";
import { DisconnectBanner } from "../../components/DisconnectBanner/DisconnectBanner";
import { Flag } from "../../components/Flag/Flag";
import { LanguageCard } from "../../components/LanguageCard/LanguageCard";
import { MuteButton } from "../../components/MuteButton/MuteButton";
import { PauseOverlay } from "../../components/PauseOverlay/PauseOverlay";
import { PlayerTile } from "../../components/PlayerTile/PlayerTile";
import { PodiumBlock } from "../../components/PodiumBlock/PodiumBlock";
import { QrBlock } from "../../components/QrBlock/QrBlock";
import { ReconnectStrip } from "../../components/ReconnectStrip/ReconnectStrip";
import { RoomCodeBadge } from "../../components/RoomCodeBadge/RoomCodeBadge";
import { RoundIntro } from "../../components/RoundIntro/RoundIntro";
import { ScoreboardTile } from "../../components/ScoreboardTile/ScoreboardTile";
import { ScoreChip } from "../../components/ScoreChip/ScoreChip";
import { TimerRing } from "../../components/TimerRing/TimerRing";
import { TurnChip } from "../../components/TurnChip/TurnChip";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import { rank } from "../../lib/leaderboard";
import type { PlayerProfile, QuestionView, RevealView, TriviaState } from "../../lib/types";
import { categoryMeta, findPlayer, formatScore, secondsLeft, slotMeta } from "../../lib/view";
import type { EndStats } from "../../plugins/scoring/types";

/** The stage island's per-instance state (synced snapshot + UI-only bits). */
export type StageState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** Mute toggle (wired; audio is out of scope for v1). */
  muted: boolean;
  /** The lobby QR matrix (fetched once after the room opens). */
  qr: QrMatrix | null;
  /** The room code (from the descriptor). */
  code: string;
  /** Ticking clock (ms) so deadline-driven UI re-renders. */
  now: number;
  /** Whether a transient reconnect strip is showing. */
  reconnecting: boolean;
  /** Whether the disconnect banner was dismissed this drop. */
  dismissedDisconnect: boolean;
  /** End-of-match stats for the podium (host-read; `null` until final). */
  endStats: EndStats | null;
};

/** Props for the top-level stage view. */
export type StageViewProps = {
  state: StageState;
  onMute: () => void;
  onDismissDisconnect: () => void;
};

/** The context badge text for the top bar, per phase. */
function badgeFor(s: TriviaState): string {
  const { phase, round } = s.match;
  if (phase === "lobby") return "Lobby";
  if (phase === "languageVote") return "Match setup";
  if (phase === "scoreboard") return `After Round ${round}`;
  if (phase === "final") return "🏆 Final Results";
  return `Round ${round} / ${TRIVIA.rounds}`;
}

/** B1 — the persistent top bar (logo · context badge · mute). */
function TopBar({ s, muted, onMute }: { s: TriviaState; muted: boolean; onMute: () => void }) {
  return (
    <header data-region="top-bar">
      <span data-logo>
        trivia<b>.</b>
      </span>
      <span data-badge>{badgeFor(s)}</span>
      <MuteButton muted={muted} onToggle={onMute} />
    </header>
  );
}

/** A1 — the lobby (room code + QR on the left, the joining players on the right). */
function Lobby({ state }: { state: StageState }) {
  const { s, qr, code } = state;
  const joined = s.players.filter(p => p.connected).length;
  const slots = Math.max(TRIVIA.players.max, s.players.length);
  const empties = Math.max(0, slots - s.players.length);

  return (
    <div data-screen="lobby">
      <div data-lobby-join>
        <RoomCodeBadge code={code || "····"} />
        <QrBlock matrix={qr} hint="Scan to join — or enter the code" />
      </div>
      <div data-lobby-players>
        <h2 data-heading>Players joining</h2>
        <div data-player-grid>
          {s.players.map((player, index) => (
            <PlayerTile key={player.peerId} player={player} index={index} />
          ))}
          {Array.from({ length: empties }, (_, i) => (
            <PlayerTile key={`empty-${i}`} empty />
          ))}
        </div>
        <p data-help>
          {joined} / {TRIVIA.players.max} players joined · Waiting for host to start…
        </p>
      </div>
    </div>
  );
}

/** A2 — the language pick (two cards + the live tally). */
function LanguagePick({ state }: { state: StageState }) {
  const { s, now } = state;
  const vote = s.languageVote;
  const votersFor = (lang: string): string[] =>
    (vote.options.find(o => o.lang === lang)?.voters ?? []).map(
      id => findPlayer(s.players, id)?.avatar ?? "•"
    );
  const en = votersFor("en");
  const ru = votersFor("ru");
  const leadLabel = vote.leading === "ru" ? "Русский" : "English";
  const secs = secondsLeft(vote.deadlineTs, now);

  return (
    <div data-screen="language">
      <h1 data-title>Pick a language for this match</h1>
      <p data-subtitle>Most votes wins — tap on your phone</p>
      <div data-language-cards>
        <LanguageCard
          lang="en"
          label="English"
          flag="us"
          voters={en}
          leading={vote.leading === "en"}
        />
        <LanguageCard
          lang="ru"
          label="Русский"
          sublabel="Russian · Кириллица"
          flag="ru"
          voters={ru}
          leading={vote.leading === "ru"}
        />
      </div>
      <p data-tally>
        {leadLabel} leads {en.length}–{ru.length} · Confirming in {secs}s…
      </p>
    </div>
  );
}

/** A3 — the category pick (TV spectator view: who's picking + the grid). */
function CategoryPick({ state }: { state: StageState }) {
  const { s } = state;
  const active = findPlayer(s.players, s.match.activePeer);
  const exhausted = new Set(s.categories.filter(c => c.exhausted).map(c => c.id));

  return (
    <div data-screen="category">
      <div data-chooser>
        <span data-who>
          {active?.avatar ?? "•"} {active?.name ?? "Someone"} is picking a category…
        </span>
        <DifficultyPips tier={ramp(s.match.round)} />
      </div>
      <div data-category-grid>
        {TRIVIA.categories.map(category => (
          <CategoryCard
            key={category.id}
            category={category}
            state={exhausted.has(category.id) ? "dimmed" : "idle"}
            color={active?.color}
          />
        ))}
      </div>
    </div>
  );
}

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

/** A4/A5 + A6 — the question screen (and its in-place reveal). */
function QuestionScreen({ state, revealing }: { state: StageState; revealing: boolean }) {
  const { s, now } = state;
  const question = s.question;
  if (!question) return <div data-screen="question" />;

  const meta = categoryMeta(question.category);
  const answerer = findPlayer(s.players, question.answeringPeer);
  const scorer = findPlayer(s.players, s.reveal.scorerPeer);
  const totalMs = question.mode === "steal" ? TRIVIA.timers.stealMs : TRIVIA.timers.answerMs;
  const remainingMs = Math.max(0, question.deadlineTs - now);
  const scorerDelta = s.scores.find(e => e.peerId === s.reveal.scorerPeer)?.delta ?? 0;
  const copy = revealing ? revealCopy(s.reveal, scorer, answerer, scorerDelta) : null;

  return (
    <div data-screen="question">
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

      {s.steal.active && !revealing && <StealStrip state={state} />}

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

/** F1 — the steal strip (slides in when a steal opens). */
function StealStrip({ state }: { state: StageState }) {
  const { s, now } = state;
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

/** A7 — the interstitial scoreboard. */
function Scoreboard({ state }: { state: StageState }) {
  const { s } = state;
  const ranked = rank(s.scores);
  const maxTotal = Math.max(1, ...ranked.map(e => e.total));

  return (
    <div data-screen="scoreboard">
      <h1 data-title>Standings after Round {s.match.round}</h1>
      <div data-scoreboard-list>
        {ranked.map(entry => {
          const player = findPlayer(s.players, entry.peerId);
          if (!player) return null;
          const overtaken =
            entry.rank < entry.prevRank
              ? findPlayer(s.players, ranked.find(e => e.rank === entry.rank + 1)?.peerId)?.name
              : undefined;
          return (
            <ScoreboardTile
              key={entry.peerId}
              rank={entry.rank}
              player={player}
              total={entry.total}
              maxTotal={maxTotal}
              movedUpOver={overtaken}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A8 — the final podium. */
function Podium({ state }: { state: StageState }) {
  const { s, endStats } = state;
  const ranked = rank(s.scores);
  const podium = ranked.slice(0, 3);
  const alsoRans = ranked.slice(3);
  const order: Array<{ place: 1 | 2 | 3; index: number }> = [
    { place: 2, index: 1 },
    { place: 1, index: 0 },
    { place: 3, index: 2 }
  ];

  const steals = findPlayer(s.players, endStats?.mostSteals?.peerId);
  const streak = findPlayer(s.players, endStats?.highestStreak?.peerId);

  return (
    <div data-screen="podium">
      <Confetti />
      <h1 data-title>🎉 Game Over! ♪</h1>
      <div data-podium-stage>
        {order.map(({ place, index }) => {
          const entry = podium[index];
          const player = entry && findPlayer(s.players, entry.peerId);
          if (!entry || !player) return null;
          return (
            <PodiumBlock key={player.peerId} place={place} player={player} score={entry.total} />
          );
        })}
      </div>
      {alsoRans.length > 0 && (
        <div data-also-rans>
          {alsoRans.map(entry => {
            const player = findPlayer(s.players, entry.peerId);
            if (!player) return null;
            return (
              <span key={entry.peerId} data-also-ran>
                {player.avatar} {player.name} {formatScore(entry.total)}
              </span>
            );
          })}
        </div>
      )}
      {endStats && (steals || streak) && (
        <p data-stat-line>
          {steals && endStats.mostSteals
            ? `Most steals — ${steals.name} ${steals.avatar} (${endStats.mostSteals.count})`
            : ""}
          {steals && streak ? " · " : ""}
          {streak && endStats.highestStreak
            ? `Highest streak — ${endStats.highestStreak.streak} (${streak.name} ${streak.avatar})`
            : ""}
        </p>
      )}
    </div>
  );
}

/** Pick the screen body for the current phase. */
function screenFor(state: StageState): JSX.Element {
  const phase = state.s.match.phase;
  if (phase === "lobby") return <Lobby state={state} />;
  if (phase === "languageVote") return <LanguagePick state={state} />;
  if (phase === "categoryPick") return <CategoryPick state={state} />;
  if (phase === "question") return <QuestionScreen state={state} revealing={false} />;
  if (phase === "reveal") return <QuestionScreen state={state} revealing />;
  if (phase === "scoreboard") return <Scoreboard state={state} />;
  if (phase === "final") return <Podium state={state} />;
  return <Lobby state={state} />;
}

/**
 * Render the whole TV/stage surface for the current snapshot.
 *
 * @param props - The island state + the mute/dismiss callbacks.
 * @returns The stage view.
 * @example
 * ```tsx
 * <StageView state={state} onMute={toggleMute} onDismissDisconnect={dismiss} />
 * ```
 */
export function StageView({ state, onMute, onDismissDisconnect }: StageViewProps): JSX.Element {
  const { s } = state;
  const phase = s.match.phase;
  const dropped = state.dismissedDisconnect ? undefined : s.players.find(p => !p.connected);

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
      <TopBar s={s} muted={state.muted} onMute={onMute} />
      <div data-region="stage-body">{screenFor(state)}</div>
      {state.reconnecting && <ReconnectStrip />}
      {dropped && (
        <DisconnectBanner
          avatar={dropped.avatar}
          name={dropped.name}
          color={dropped.color}
          secondsLeft={TRIVIA.timers.stealMs / 1000}
          onDismiss={onDismissDisconnect}
        />
      )}
      {s.match.paused && <PauseOverlay name={findPlayer(s.players, s.match.hostPeer)?.name} />}
    </div>
  );
}
