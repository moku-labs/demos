import type { JsonValue } from "@moku-labs/room";
import { describe, expect, it } from "vitest";
import { emptyState, mergeState } from "../../src/lib/room/snapshot";

/** A fake slice reader backed by a plain cell map. */
function reader(cells: Record<string, Record<string, JsonValue>>) {
  return (ns: string) => cells[ns];
}

describe("snapshot.emptyState", () => {
  it("is a pristine lobby with empty rosters and no live question", () => {
    const s = emptyState();
    expect(s.match.phase).toBe("lobby");
    expect(s.players).toEqual([]);
    expect(s.question).toBeNull();
    expect(s.self).toBeNull();
    expect(s.languageVote.leading).toBe("en");
  });
});

describe("snapshot.mergeState", () => {
  it("casts the raw slices into typed views and passes through self", () => {
    const read = reader({
      match: {
        phase: "question",
        round: 7,
        activePeer: "p1",
        language: "en",
        hostPeer: "p1",
        paused: false
      },
      players: {
        entries: [
          {
            peerId: "p1",
            name: "Alex",
            color: "#F59E0B",
            avatar: "🦊",
            connected: true,
            isHost: true
          }
        ]
      },
      question: {
        id: "q1",
        category: "animals",
        tier: "medium",
        type: "text",
        prompt: "Which animal can thaw back to life?",
        options: ["Arctic fox", "Wood frog", "Snow hare", "Reindeer"],
        answeringPeer: "p1",
        mode: "answer",
        deadlineTs: 123
      },
      scores: { entries: [{ peerId: "p1", total: 200, delta: 200, rank: 1, prevRank: 1 }] }
    });

    const s = mergeState(read, "p1");
    expect(s.self).toBe("p1");
    expect(s.match.phase).toBe("question");
    expect(s.match.round).toBe(7);
    expect(s.players).toHaveLength(1);
    expect(s.question?.id).toBe("q1");
    expect(s.question?.options).toHaveLength(4);
    expect(s.scores[0]?.total).toBe(200);
  });

  it("collapses a blank question slice (id === '') to null", () => {
    const read = reader({
      question: {
        id: "",
        category: "",
        tier: "",
        type: "text",
        prompt: "",
        options: [],
        answeringPeer: "",
        mode: "answer",
        deadlineTs: 0
      }
    });
    expect(mergeState(read, undefined).question).toBeNull();
  });

  it("falls back to defaults for unsynced slices", () => {
    const s = mergeState(() => undefined, undefined);
    expect(s.match.phase).toBe("lobby");
    expect(s.steal.active).toBe(false);
    expect(s.bank.status).toBe("idle");
    expect(s.categories).toEqual([]);
  });
});
