/**
 * @file The pure sound "director" — maps a `TriviaState` transition (previous → next) to a list of
 * {@link Cue}s for a surface (TV stage vs phone controller). The testable heart of the audio layer: no
 * WebAudio, no timers, no DOM — just `(previous, next, surface) => Cue[]`. The browser glue (`index.ts`)
 * subscribes to the room bridge, calls this on every snapshot, and executes the cues.
 *
 * Surface split mirrors the game's golden rule: the **TV** carries the drama (music, joins, reveal
 * stings, scoreboard, fanfare); each **phone** only reacts to *its own* moments (your-turn / your-steal
 * nudges + the reveal flash for the answerer). A cue is emitted only on the edge that warrants it, so the
 * stage's 250 ms re-render poll (identical snapshots) makes no spurious sound. (The "category chosen"
 * flourish fires on the TV when the `categoryReveal` beat begins — the F3 banner drop.)
 *
 * Each concern is a small builder returning its own cue list; `diffCues` concatenates the relevant ones
 * for the surface, so every function stays flat and individually testable.
 */
import { ramp } from "../difficulty";
import { boardRows, maxClimb } from "../leaderboard";
import type { ScoreEntry, TriviaState } from "../types";
import { joinRate, overtakeRate, streakRate } from "./ladder";
import type { Cue, MusicId, Surface } from "./types";

/** Lead time before a deadline at which the "final seconds" urgency cue is scheduled (ms). */
const URGENT_LEAD_MS = 3000;

/**
 * The looping music bed for a phase — lobby/language pick share the calm lobby bed, the final screen gets
 * the podium bed, and everything in the round loop runs under the game bed.
 *
 * @param phase - The match phase.
 * @returns The bed id to loop under that phase.
 * @example
 * ```ts
 * bedFor("question"); // "bed.game"
 * ```
 */
export function bedFor(phase: TriviaState["match"]["phase"]): MusicId {
  if (phase === "lobby" || phase === "languageVote") return "bed.lobby";
  if (phase === "final") return "bed.podium";
  return "bed.game";
}

/**
 * Map a round's difficulty tier to a 0–1 music intensity (the game bed opens up as the ramp climbs).
 *
 * @param round - The 1-based round number.
 * @param playerCount - The connected player count (fair round scaling — item 5).
 * @param totalRounds - This match's scaled total round count (item 5).
 * @returns The 0–1 intensity for the music bed.
 * @example
 * ```ts
 * intensityFor(12, 3, 12); // 1 (hard band)
 * ```
 */
function intensityFor(round: number, playerCount: number, totalRounds: number): number {
  const tier = ramp(round, playerCount, totalRounds);
  if (tier === "hard") return 1;
  if (tier === "medium") return 0.72;
  return 0.5;
}

/**
 * The round-intro stamp pitch — heavier (lower) as the difficulty band climbs.
 *
 * @param round - The 1-based round number.
 * @param playerCount - The connected player count (fair round scaling — item 5).
 * @param totalRounds - This match's scaled total round count (item 5).
 * @returns The playback-rate multiplier for the round-intro cue.
 * @example
 * ```ts
 * introRate(10, 3, 12); // 0.84 (hard band, lands heavier)
 * ```
 */
function introRate(round: number, playerCount: number, totalRounds: number): number {
  const tier = ramp(round, playerCount, totalRounds);
  if (tier === "hard") return 0.84;
  if (tier === "medium") return 0.92;
  return 1;
}

/**
 * Total number of live language-vote ballots across all options.
 *
 * @param s - The snapshot.
 * @returns The total ballot count.
 * @example
 * ```ts
 * totalVoters(state); // 3
 * ```
 */
function totalVoters(s: TriviaState): number {
  let total = 0;
  for (const option of s.languageVote.options) total += option.voters.length;
  return total;
}

/**
 * Whether this device is the player currently on the hook to answer (for the phone reveal flash/haptic).
 *
 * @param s - The snapshot.
 * @returns `true` when `self` is the answering peer.
 * @example
 * ```ts
 * if (selfIsAnswerer(state)) flash();
 * ```
 */
function selfIsAnswerer(s: TriviaState): boolean {
  return s.self !== null && s.question !== null && s.question.answeringPeer === s.self;
}

/**
 * Whether it is this device's turn to pick a category (the phone "look up" nudge).
 *
 * @param s - The snapshot.
 * @returns `true` when `self` is the active player.
 * @example
 * ```ts
 * if (isMyTurn(state)) nudge();
 * ```
 */
function isMyTurn(s: TriviaState): boolean {
  return s.match.activePeer !== null && s.match.activePeer === s.self;
}

/**
 * The scorer's best streak (drives the correct-chime pitch ladder); 0 when there is no scorer/peer.
 *
 * @param scores - The scoreboard rows.
 * @param peer - The scorer's peer id, or `null`.
 * @returns The scorer's best streak, or 0.
 * @example
 * ```ts
 * streakOf(scores, "p0"); // 3
 * ```
 */
function streakOf(scores: ScoreEntry[], peer: string | null): number {
  if (peer === null) return 0;
  return scores.find(entry => entry.peerId === peer)?.bestStreak ?? 1;
}

/**
 * The TV's reveal sting for a resolved outcome (+ the score count-up where points were earned).
 *
 * @param outcome - The resolved outcome.
 * @param scores - The scoreboard rows (for the streak pitch).
 * @param scorerPeer - The scorer's peer id, or `null`.
 * @returns The stage reveal cues.
 * @example
 * ```ts
 * stageRevealCues("correct", scores, "p0"); // [reveal.correct, score.countup]
 * ```
 */
function stageRevealCues(
  outcome: TriviaState["reveal"]["outcome"],
  scores: ScoreEntry[],
  scorerPeer: string | null
): Cue[] {
  switch (outcome) {
    case "correct": {
      return [
        {
          kind: "sfx",
          id: "reveal.correct",
          opts: { rate: streakRate(streakOf(scores, scorerPeer)) }
        },
        { kind: "sfx", id: "score.countup" }
      ];
    }
    case "stolen": {
      return [
        { kind: "sfx", id: "steal.success" },
        { kind: "sfx", id: "score.countup" }
      ];
    }
    case "wrong": {
      return [{ kind: "sfx", id: "reveal.wrong" }];
    }
    default: {
      return [{ kind: "sfx", id: "reveal.unanswered" }];
    }
  }
}

/**
 * The answerer's own phone flash + buzz (a steal the active player lost reads as a miss for them).
 *
 * @param outcome - The resolved outcome.
 * @returns The phone reveal cues (a flash SFX + its haptic).
 * @example
 * ```ts
 * phoneRevealCues("correct"); // [reveal.correct, haptic correct]
 * ```
 */
function phoneRevealCues(outcome: TriviaState["reveal"]["outcome"]): Cue[] {
  const win = outcome === "correct" || outcome === "stolen";
  return [
    { kind: "sfx", id: win ? "reveal.correct" : "reveal.wrong" },
    { kind: "haptic", id: win ? "correct" : "wrong" }
  ];
}

/**
 * The reveal cues for both surfaces (the TV outcome sting + the answerer's phone flash).
 *
 * @param next - The current snapshot.
 * @param stage - Whether this is the TV surface.
 * @param controller - Whether this is the phone surface.
 * @returns The reveal cues.
 * @example
 * ```ts
 * revealCues(state, true, false);
 * ```
 */
function revealCues(next: TriviaState, stage: boolean, controller: boolean): Cue[] {
  const { outcome, scorerPeer } = next.reveal;
  return [
    ...(stage ? stageRevealCues(outcome, next.scores, scorerPeer) : []),
    ...(controller && selfIsAnswerer(next) ? phoneRevealCues(outcome) : [])
  ];
}

/**
 * The question-entry cues (TV): the stagger-in pluck, an image flourish, and the scheduled urgency.
 *
 * @param next - The current snapshot (with a live question).
 * @returns The question cues.
 * @example
 * ```ts
 * questionCues(state); // [question.in, schedule timer.urgent]
 * ```
 */
function questionCues(next: TriviaState): Cue[] {
  if (!next.question) return [];
  const image: Cue[] =
    next.question.type === "image" ? [{ kind: "sfx", id: "question.image" }] : [];
  const urgency: Cue = {
    kind: "schedule",
    id: "timer.urgent",
    atTs: next.question.deadlineTs - URGENT_LEAD_MS
  };
  return [{ kind: "sfx", id: "question.in" }, ...image, urgency];
}

/**
 * The scoreboard-entry cues (TV): the stack-in whoosh + a pitched overtake when a tile climbed.
 *
 * @param next - The current snapshot.
 * @returns The scoreboard cues.
 * @example
 * ```ts
 * scoreboardCues(state); // [board.in, board.overtake]
 * ```
 */
function scoreboardCues(next: TriviaState): Cue[] {
  // Pitch by the SAME derived climb the board animates (spec/scoreboard-animation.md §5), so the
  // whoosh matches the motion — the synced rank fields under-reported multi-award steal rounds.
  const climb = maxClimb(boardRows(next.players, next.scores));
  const overtake: Cue[] =
    climb > 0 ? [{ kind: "sfx", id: "board.overtake", opts: { rate: overtakeRate(climb) } }] : [];
  return [{ kind: "sfx", id: "board.in" }, ...overtake];
}

/**
 * The final-screen cues: the TV's fanfare + confetti, or a soft play-again chime on the phone.
 *
 * @param stage - Whether this is the TV surface.
 * @returns The final cues.
 * @example
 * ```ts
 * finalCues(true); // [match.fanfare, match.confetti]
 * ```
 */
function finalCues(stage: boolean): Cue[] {
  if (!stage) return [{ kind: "sfx", id: "match.playagain", opts: { gain: 0.7 } }];
  return [
    { kind: "sfx", id: "match.fanfare" },
    { kind: "sfx", id: "match.confetti" }
  ];
}

/**
 * The one-shot cues fired on entering a new phase (each phase is mutually exclusive, so this dispatches
 * to one builder).
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @param stage - Whether this is the TV surface.
 * @param controller - Whether this is the phone surface.
 * @returns The phase-entry cues.
 * @example
 * ```ts
 * entryCues(prev, questionState, true, false);
 * ```
 */
function entryCues(
  previous: TriviaState | undefined,
  next: TriviaState,
  stage: boolean,
  controller: boolean
): Cue[] {
  if (previous && previous.match.phase === next.match.phase) return [];
  const phase = next.match.phase;

  if (stage && phase === "roundIntro") {
    const playerCount = Math.max(1, next.players.filter(p => p.connected).length);
    const rate = introRate(next.match.round, playerCount, next.match.totalRounds || 12);
    return [{ kind: "sfx", id: "round.intro", opts: { rate } }];
  }
  if (stage && phase === "categoryReveal") return [{ kind: "sfx", id: "category.chosen" }];
  if (stage && phase === "question") return questionCues(next);
  if (phase === "reveal") return revealCues(next, stage, controller);
  if (stage && phase === "scoreboard") return scoreboardCues(next);
  if (phase === "final") return finalCues(stage);
  if (controller && phase === "categoryPick" && isMyTurn(next)) {
    return [
      { kind: "sfx", id: "steal.nudge" },
      { kind: "haptic", id: "nudge" }
    ];
  }
  return [];
}

/**
 * The music-bed cues (TV only): switch beds on a phase-group change, or refresh the game-bed intensity
 * when the difficulty band steps.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @returns The music cues (at most one).
 * @example
 * ```ts
 * musicCues(undefined, lobbyState); // [music bed.lobby]
 * ```
 */
function musicCues(previous: TriviaState | undefined, next: TriviaState): Cue[] {
  const nextBed = bedFor(next.match.phase);
  const previousBed = previous ? bedFor(previous.match.phase) : undefined;
  const playerCount = Math.max(1, next.players.filter(p => p.connected).length);
  const totalRounds = next.match.totalRounds || 12;
  const intensity = intensityFor(next.match.round, playerCount, totalRounds);

  if (nextBed !== previousBed) return [{ kind: "music", id: nextBed, intensity }];
  const previousTier = previous ? ramp(previous.match.round, playerCount, totalRounds) : undefined;
  const nextTier = ramp(next.match.round, playerCount, totalRounds);
  if (previous && nextBed === "bed.game" && previousTier !== nextTier) {
    return [{ kind: "music", id: "bed.game", intensity }];
  }
  return [];
}

/**
 * The steal-open cues (TV): the sting, plus a scheduled last-seconds urgency when the steal has a deadline.
 *
 * @param next - The current snapshot (steal active).
 * @returns The steal-open cues.
 * @example
 * ```ts
 * stealOpenCues(state); // [steal.open, schedule timer.urgent]
 * ```
 */
function stealOpenCues(next: TriviaState): Cue[] {
  const open: Cue = { kind: "sfx", id: "steal.open" };
  if (next.steal.deadlineTs === null) return [open];
  return [
    open,
    { kind: "schedule", id: "timer.urgent", atTs: next.steal.deadlineTs - URGENT_LEAD_MS }
  ];
}

/**
 * The steal cues: the TV's steal-open sting, and the phone's nudge + buzz when the steal is granted to
 * this device.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @param stage - Whether this is the TV surface.
 * @param controller - Whether this is the phone surface.
 * @returns The steal cues.
 * @example
 * ```ts
 * stealCues(prev, next, true, false); // [steal.open, schedule timer.urgent]
 * ```
 */
function stealCues(
  previous: TriviaState | undefined,
  next: TriviaState,
  stage: boolean,
  controller: boolean
): Cue[] {
  if (!previous) return [];
  const opened = stage && !previous.steal.active && next.steal.active;
  // Open steal: nudge this phone when it BECOMES eligible (enters the stealPeers set) — covers both the
  // initial open and a later re-grant, and never re-fires while it stays eligible across ticks.
  const self = next.self;
  const grantedToSelf =
    controller &&
    self !== null &&
    next.steal.active &&
    next.steal.stealPeers.includes(self) &&
    !previous.steal.stealPeers.includes(self);
  return [
    ...(opened ? stealOpenCues(next) : []),
    ...(grantedToSelf
      ? ([
          { kind: "sfx", id: "steal.nudge" },
          { kind: "haptic", id: "nudge" }
        ] as Cue[])
      : [])
  ];
}

/**
 * The lobby join/leave cues (TV only): a laddered pop per newly-joined player, or one deflate on a leave.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @returns The join/leave cues.
 * @example
 * ```ts
 * lobbyCues(prev, next); // [join.pop]
 * ```
 */
function lobbyCues(previous: TriviaState | undefined, next: TriviaState): Cue[] {
  if (!previous || next.match.phase !== "lobby") return [];
  const before = previous.players.length;
  const after = next.players.length;

  if (after > before) {
    return Array.from(
      { length: after - before },
      (_, k): Cue => ({ kind: "sfx", id: "join.pop", opts: { rate: joinRate(before + k) } })
    );
  }
  if (after < before) return [{ kind: "sfx", id: "join.leave" }];
  return [];
}

/**
 * The language-vote cues (TV only): a lock on confirm, else a blip per new ballot.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @returns The vote cues (at most one).
 * @example
 * ```ts
 * voteCues(prev, confirmedState); // [vote.lock]
 * ```
 */
function voteCues(previous: TriviaState | undefined, next: TriviaState): Cue[] {
  if (!previous) return [];
  const wasConfirmed = previous.languageVote.confirmed !== null;
  const nowConfirmed = next.languageVote.confirmed !== null;
  if (!wasConfirmed && nowConfirmed) return [{ kind: "sfx", id: "vote.lock" }];
  if (totalVoters(next) > totalVoters(previous)) return [{ kind: "sfx", id: "vote.cast" }];
  return [];
}

/**
 * The pause cues (TV only): enter/exit stings on the pause toggle.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call.
 * @param next - The current snapshot.
 * @returns The pause cues (at most one).
 * @example
 * ```ts
 * pauseCues(prev, pausedState); // [pause.enter]
 * ```
 */
function pauseCues(previous: TriviaState | undefined, next: TriviaState): Cue[] {
  if (!previous) return [];
  if (!previous.match.paused && next.match.paused) return [{ kind: "sfx", id: "pause.enter" }];
  if (previous.match.paused && !next.match.paused) return [{ kind: "sfx", id: "pause.exit" }];
  return [];
}

/**
 * Compute the sound cues for a single state transition.
 *
 * @param previous - The previous snapshot, or `undefined` on the first call (only the bed is emitted).
 * @param next - The current snapshot.
 * @param surface - Which surface this director runs on (`"stage"` = TV, `"controller"` = phone).
 * @returns The ordered cues to execute for this transition (possibly empty).
 * @example
 * ```ts
 * for (const cue of diffCues(previous, next, "stage")) execute(cue);
 * ```
 */
export function diffCues(
  previous: TriviaState | undefined,
  next: TriviaState,
  surface: Surface
): Cue[] {
  const stage = surface === "stage";
  const controller = surface === "controller";
  return [
    ...(stage ? musicCues(previous, next) : []),
    ...entryCues(previous, next, stage, controller),
    ...stealCues(previous, next, stage, controller),
    ...(stage ? lobbyCues(previous, next) : []),
    ...(stage ? voteCues(previous, next) : []),
    ...(stage ? pauseCues(previous, next) : [])
  ];
}
