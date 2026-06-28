/**
 * @file Unit tests for the pure sound director (`src/lib/sound/director.ts`). It maps a `TriviaState`
 * transition to cues; these pin every important edge: the surface split (TV drama vs phone-only nudges/
 * flash), the reveal-outcome branches, the join/steal/scoreboard/fanfare moments, the pitch-laddered
 * cues, and the "no spurious sound on an identical snapshot" property that keeps the 250 ms poll quiet.
 */
/* eslint-disable unicorn/no-null -- the fixtures construct the domain's nullable slice values (self,
   scorerPeer, stealPeer, confirmed, …), exactly as the room bridge does. */
import { describe, expect, it } from "vitest";
import { emptyState } from "../../../src/lib/room/snapshot";
import { bedFor, diffCues } from "../../../src/lib/sound/director";
import type { Cue, SfxId } from "../../../src/lib/sound/types";
import type {
  Phase,
  PlayerProfile,
  QuestionView,
  ScoreEntry,
  TriviaState
} from "../../../src/lib/types";

/** Minimal joined players (the director only reads `players.length` for the lobby pop/leave). */
function players(count: number): PlayerProfile[] {
  return Array.from({ length: count }, (_, i) => ({
    peerId: `p${i}`,
    name: `P${i}`,
    color: "#fff",
    avatar: "🦊",
    connected: true,
    isHost: i === 0
  }));
}

/** A live question with sensible defaults. */
function question(over: Partial<QuestionView> = {}): QuestionView {
  return {
    id: "q1",
    category: "animals",
    tier: "easy",
    type: "text",
    prompt: "?",
    options: ["a", "b", "c", "d"],
    answeringPeer: "p0",
    mode: "answer",
    deadlineTs: 100_000,
    ...over
  };
}

/** A score row (rank/prevRank drive the overtake; bestStreak drives the correct-chime pitch). */
function score(peerId: string, rank: number, prevRank: number, bestStreak = 1): ScoreEntry {
  return { peerId, total: 0, delta: 0, rank, prevRank, bestStreak };
}

/** A flat override bag for {@link st}. */
type Over = {
  phase?: Phase;
  round?: number;
  self?: string | null;
  activePeer?: string | null;
  playerCount?: number;
  paused?: boolean;
  steal?: Partial<TriviaState["steal"]>;
  question?: QuestionView | null;
  reveal?: Partial<TriviaState["reveal"]>;
  scores?: ScoreEntry[];
  voters?: string[];
  confirmed?: TriviaState["languageVote"]["confirmed"];
};

/** Build a `TriviaState` from a flat override bag (nested slices merged onto the empty lobby state). */
function st(over: Over): TriviaState {
  const base = emptyState();
  return {
    ...base,
    self: over.self ?? null,
    match: {
      ...base.match,
      phase: over.phase ?? "lobby",
      round: over.round ?? 1,
      activePeer: over.activePeer ?? null,
      paused: over.paused ?? false
    },
    players: players(over.playerCount ?? 0),
    question: over.question === undefined ? null : over.question,
    reveal: { ...base.reveal, ...over.reveal },
    steal: { ...base.steal, ...over.steal },
    scores: over.scores ?? [],
    languageVote: {
      ...base.languageVote,
      confirmed: over.confirmed ?? null,
      options: over.voters ? [{ lang: "en", voters: over.voters }] : []
    }
  };
}

/** The SFX ids in a cue list (order-preserving). */
function sfx(cues: Cue[]): SfxId[] {
  return cues.flatMap(c => (c.kind === "sfx" ? [c.id] : []));
}

/** Find one cue by a predicate. */
function find(cues: Cue[], predicate: (c: Cue) => boolean): Cue | undefined {
  return cues.find(cue => predicate(cue));
}

/** Enter the reveal phase from a live question and return the stage cues. */
function enterReveal(reveal: Partial<TriviaState["reveal"]>, scores: ScoreEntry[] = []): Cue[] {
  return diffCues(
    st({ phase: "question", question: question() }),
    st({ phase: "reveal", question: question(), reveal, scores }),
    "stage"
  );
}

/** Enter the reveal phase on a phone and return its cues (answerer-only flash). */
function revealFlash(
  outcome: TriviaState["reveal"]["outcome"],
  self: string,
  answering: string
): Cue[] {
  return diffCues(
    st({ phase: "question", self, question: question({ answeringPeer: answering }) }),
    st({
      phase: "reveal",
      self,
      question: question({ answeringPeer: answering }),
      reveal: { outcome }
    }),
    "controller"
  );
}

describe("bedFor", () => {
  it("groups the eight phases into the three beds", () => {
    expect(bedFor("lobby")).toBe("bed.lobby");
    expect(bedFor("languageVote")).toBe("bed.lobby");
    expect(bedFor("categoryPick")).toBe("bed.game");
    expect(bedFor("question")).toBe("bed.game");
    expect(bedFor("final")).toBe("bed.podium");
  });
});

describe("diffCues — first call + identical snapshots", () => {
  it("emits only the lobby bed on the stage's first snapshot", () => {
    expect(diffCues(undefined, st({ phase: "lobby", playerCount: 3 }), "stage")).toEqual([
      { kind: "music", id: "bed.lobby", intensity: 0.5 }
    ]);
  });

  it("emits nothing on the controller's first snapshot", () => {
    expect(diffCues(undefined, st({ phase: "lobby" }), "controller")).toEqual([]);
  });

  it("emits nothing when nothing changed (the 250 ms poll stays silent)", () => {
    const s = st({ phase: "question", question: question() });
    expect(diffCues(s, s, "stage")).toEqual([]);
  });
});

describe("diffCues — lobby join / leave (stage)", () => {
  it("pops a laddered join when a player appears", () => {
    const pop = find(
      diffCues(
        st({ phase: "lobby", playerCount: 1 }),
        st({ phase: "lobby", playerCount: 2 }),
        "stage"
      ),
      c => c.kind === "sfx" && c.id === "join.pop"
    );
    expect(pop).toBeDefined();
    expect(pop?.kind === "sfx" && pop.opts?.rate).toBeGreaterThan(1);
  });

  it("emits a single deflate when a player leaves", () => {
    expect(
      sfx(
        diffCues(
          st({ phase: "lobby", playerCount: 3 }),
          st({ phase: "lobby", playerCount: 2 }),
          "stage"
        )
      )
    ).toContain("join.leave");
  });
});

describe("diffCues — round + question entry (stage)", () => {
  it("switches to the game bed and stamps the round intro", () => {
    const cues = diffCues(st({ phase: "lobby" }), st({ phase: "roundIntro" }), "stage");
    expect(find(cues, c => c.kind === "music" && c.id === "bed.game")).toBeDefined();
    expect(sfx(cues)).toContain("round.intro");
  });

  it("plays the question + schedules the last-seconds urgency, with an image flourish", () => {
    const cues = diffCues(
      st({ phase: "categoryPick" }),
      st({ phase: "question", question: question({ type: "image", deadlineTs: 50_000 }) }),
      "stage"
    );
    expect(sfx(cues)).toEqual(expect.arrayContaining(["question.in", "question.image"]));
    expect(find(cues, c => c.kind === "schedule")).toEqual({
      kind: "schedule",
      id: "timer.urgent",
      atTs: 47_000
    });
  });
});

describe("diffCues — reveal outcomes (stage)", () => {
  it("correct → reveal.correct (streak-pitched) + score count-up", () => {
    const cues = enterReveal({ outcome: "correct", scorerPeer: "p0" }, [score("p0", 1, 1, 3)]);
    const correct = find(cues, c => c.kind === "sfx" && c.id === "reveal.correct");
    expect(correct?.kind === "sfx" && correct.opts?.rate).toBeGreaterThan(1);
    expect(sfx(cues)).toContain("score.countup");
  });

  it("stolen → steal.success + count-up; wrong → reveal.wrong; timeout → reveal.unanswered", () => {
    expect(sfx(enterReveal({ outcome: "stolen", scorerPeer: "p1" }))).toEqual(
      expect.arrayContaining(["steal.success", "score.countup"])
    );
    expect(sfx(enterReveal({ outcome: "wrong" }))).toContain("reveal.wrong");
    expect(sfx(enterReveal({ outcome: "timeout" }))).toContain("reveal.unanswered");
  });
});

describe("diffCues — reveal flash (controller, answerer only)", () => {
  it("flashes + buzzes correct for the winning answerer", () => {
    const cues = revealFlash("correct", "p0", "p0");
    expect(sfx(cues)).toContain("reveal.correct");
    expect(find(cues, c => c.kind === "haptic" && c.id === "correct")).toBeDefined();
  });

  it("flashes + buzzes wrong for the missing answerer, silent for a non-answerer", () => {
    const cues = revealFlash("wrong", "p0", "p0");
    expect(sfx(cues)).toContain("reveal.wrong");
    expect(find(cues, c => c.kind === "haptic" && c.id === "wrong")).toBeDefined();
    expect(revealFlash("correct", "p2", "p0")).toEqual([]);
  });
});

describe("diffCues — scoreboard, steal, vote, pause, final", () => {
  it("scoreboard with a climber → board.in + a pitched overtake", () => {
    const cues = diffCues(
      st({ phase: "reveal" }),
      st({ phase: "scoreboard", scores: [score("p1", 1, 3)] }),
      "stage"
    );
    expect(sfx(cues)).toContain("board.in");
    const overtake = find(cues, c => c.kind === "sfx" && c.id === "board.overtake");
    expect(overtake?.kind === "sfx" && overtake.opts?.rate).toBeGreaterThan(1);
  });

  it("steal opening → steal.open + scheduled urgency (stage)", () => {
    const cues = diffCues(
      st({ phase: "question", question: question() }),
      st({
        phase: "question",
        question: question({ mode: "steal" }),
        steal: { active: true, stealPeer: "p1", deadlineTs: 30_000 }
      }),
      "stage"
    );
    expect(sfx(cues)).toContain("steal.open");
    expect(find(cues, c => c.kind === "schedule")).toBeDefined();
  });

  it("steal granted to me / my turn to pick → nudge + buzz (controller)", () => {
    const granted = diffCues(
      st({ phase: "question", self: "p1", question: question() }),
      st({
        phase: "question",
        self: "p1",
        question: question(),
        steal: { active: true, stealPeer: "p1", deadlineTs: 30_000 }
      }),
      "controller"
    );
    expect(sfx(granted)).toContain("steal.nudge");
    expect(find(granted, c => c.kind === "haptic" && c.id === "nudge")).toBeDefined();

    const myTurn = diffCues(
      st({ phase: "roundIntro", self: "p0" }),
      st({ phase: "categoryPick", self: "p0", activePeer: "p0" }),
      "controller"
    );
    expect(sfx(myTurn)).toContain("steal.nudge");
  });

  it("language vote confirmed → vote.lock; a new ballot → vote.cast", () => {
    expect(
      sfx(
        diffCues(
          st({ phase: "languageVote" }),
          st({ phase: "languageVote", confirmed: "en" }),
          "stage"
        )
      )
    ).toContain("vote.lock");
    expect(
      sfx(
        diffCues(
          st({ phase: "languageVote" }),
          st({ phase: "languageVote", voters: ["p0"] }),
          "stage"
        )
      )
    ).toContain("vote.cast");
  });

  it("pause + resume → pause.enter / pause.exit (stage)", () => {
    expect(
      sfx(
        diffCues(
          st({ phase: "question", question: question() }),
          st({ phase: "question", question: question(), paused: true }),
          "stage"
        )
      )
    ).toContain("pause.enter");
    expect(
      sfx(
        diffCues(
          st({ phase: "question", question: question(), paused: true }),
          st({ phase: "question", question: question() }),
          "stage"
        )
      )
    ).toContain("pause.exit");
  });

  it("final → fanfare + confetti on the TV", () => {
    expect(sfx(diffCues(st({ phase: "scoreboard" }), st({ phase: "final" }), "stage"))).toEqual(
      expect.arrayContaining(["match.fanfare", "match.confetti"])
    );
  });
});
