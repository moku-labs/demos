import { createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { describe, expect, it } from "vitest";
import type { ScoreEntry } from "../../../../lib/types";
import { scoringPlugin } from "../../index";

// ─────────────────────────────────────────────────────────────────────────────
// Integration: scoring plugin with the room stage app
// ─────────────────────────────────────────────────────────────────────────────
//
// Uses inMemory() signaling so tests run without a real WebRTC/network stack.
// The stage app bundles stagePlugin (+ its engine deps: transport/session/intent/sync)
// as core defaults; we add scoringPlugin as an extra plugin.
//
// We exercise the PUBLIC scoring API (app.scoring.*) plus the SYNCED SLICE
// (app.sync.read("scores")) to verify that award/reset both propagate through
// stage.mutate → syncPlugin → the readable snapshot.

/** Build a test stage app with scoringPlugin wired in. */
const createTestStageApp = () =>
  createApp({
    // stagePlugin must come before scoringPlugin (dependency order).
    plugins: [stagePlugin, scoringPlugin],
    pluginConfigs: {
      transport: { signaling: inMemory(), iceServers: [] },
      session: { generateQr: false }
    }
  });

describe("scoring plugin (integration)", () => {
  // ── Lifecycle / wiring ───────────────────────────────────────────────────

  it("app.scoring is defined after createApp", () => {
    const app = createTestStageApp();
    expect(app.scoring).toBeDefined();
  });

  it("scores slice is registered in sync snapshot on init (entries: [])", () => {
    const app = createTestStageApp();
    const slice = app.sync.read("scores");
    expect(slice).toBeDefined();
    expect(slice?.entries).toEqual([]);
  });

  // ── award → scores slice ────────────────────────────────────────────────

  it("award writes the scores slice via stage.mutate: total and delta visible", () => {
    const app = createTestStageApp();
    const PEER = "peer-test-1";
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    const entry = slice?.entries.find(e => e.peerId === PEER);
    expect(entry).toBeDefined();
    expect(entry?.total).toBe(100);
    expect(entry?.delta).toBe(100);
    expect(entry?.rank).toBe(1);
  });

  it("multiple awards accumulate totals in the slice", () => {
    const app = createTestStageApp();
    const PEER_A = "p-a";
    const PEER_B = "p-b";

    app.scoring.award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    app.scoring.award(PEER_A, { correct: true, steal: false, tier: "medium", category: "space" }); // 200
    app.scoring.award(PEER_B, { correct: true, steal: false, tier: "hard", category: "music" }); // 300

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    const aEntry = slice?.entries.find(e => e.peerId === PEER_A);
    const bEntry = slice?.entries.find(e => e.peerId === PEER_B);

    expect(aEntry?.total).toBe(300); // 100 + 200
    expect(bEntry?.total).toBe(300);
  });

  it("ranks are recomputed correctly in the slice after multiple awards", () => {
    const app = createTestStageApp();
    const PEER_A = "p-a";
    const PEER_B = "p-b";

    app.scoring.award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // A: 100
    app.scoring.award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" }); // B: 300

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    const aEntry = slice?.entries.find(e => e.peerId === PEER_A);
    const bEntry = slice?.entries.find(e => e.peerId === PEER_B);

    expect(bEntry?.rank).toBe(1);
    expect(aEntry?.rank).toBe(2);
  });

  it("leaderboard() mirrors the slice, sorted by total desc", () => {
    const app = createTestStageApp();
    const PEER_A = "p-a";
    const PEER_B = "p-b";

    app.scoring.award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    app.scoring.award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" }); // 300

    const lb = app.scoring.leaderboard();
    expect(lb[0]?.peerId).toBe(PEER_B);
    expect(lb[1]?.peerId).toBe(PEER_A);
  });

  // ── steal scoring in the slice ───────────────────────────────────────────

  it("steal+correct awards half points in the slice", () => {
    const app = createTestStageApp();
    const PEER = "p-steal";
    app.scoring.award(PEER, { correct: true, steal: true, tier: "medium", category: "food" }); // 100

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    const entry = slice?.entries.find(e => e.peerId === PEER);
    expect(entry?.total).toBe(100);
    expect(entry?.delta).toBe(100);
  });

  it("wrong answer produces delta=0 in the slice", () => {
    const app = createTestStageApp();
    const PEER = "p-wrong";
    app.scoring.award(PEER, { correct: false, steal: false, tier: "hard", category: "strange" });

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    const entry = slice?.entries.find(e => e.peerId === PEER);
    expect(entry?.delta).toBe(0);
    expect(entry?.total).toBe(0);
  });

  // ── reset re-publishes zeroed board ─────────────────────────────────────

  it("reset() zeros all totals and deltas in the slice", () => {
    const app = createTestStageApp();
    const PEER_A = "p-a";
    const PEER_B = "p-b";

    app.scoring.award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" });
    app.scoring.reset();

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    expect(slice?.entries.every(e => e.total === 0 && e.delta === 0)).toBe(true);
  });

  it("reset() clears ranks to 0 in the slice", () => {
    const app = createTestStageApp();
    const PEER = "p-a";
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.reset();

    const slice = app.sync.read("scores") as { entries: ScoreEntry[] } | undefined;
    expect(slice?.entries.every(e => e.rank === 0)).toBe(true);
  });

  it("leaderboard() returns zeroed entries after reset()", () => {
    const app = createTestStageApp();
    const PEER = "p-a";
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.reset();
    const lb = app.scoring.leaderboard();
    expect(lb.every(e => e.total === 0)).toBe(true);
  });

  // ── endStats ─────────────────────────────────────────────────────────────

  it("endStats() reflects correct steals count", () => {
    const app = createTestStageApp();
    const PEER_A = "p-a";
    const PEER_B = "p-b";
    app.scoring.award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    app.scoring.award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    app.scoring.award(PEER_B, { correct: true, steal: true, tier: "easy", category: "animals" });

    const stats = app.scoring.endStats();
    expect(stats.mostSteals?.peerId).toBe(PEER_A);
    expect(stats.mostSteals?.count).toBe(2);
  });

  it("endStats() reflects bestStreak", () => {
    const app = createTestStageApp();
    const PEER = "p-a";
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });

    const stats = app.scoring.endStats();
    expect(stats.highestStreak?.streak).toBe(3);
    expect(stats.highestStreak?.peerId).toBe(PEER);
  });

  it("endStats() returns correct topCategory", () => {
    const app = createTestStageApp();
    const PEER = "p-a";
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "animals" });
    app.scoring.award(PEER, { correct: true, steal: false, tier: "easy", category: "space" });

    const stats = app.scoring.endStats();
    expect(stats.topCategory[PEER]).toBe("animals");
  });

  // ── No onStart/onStop (documented: pure in-memory) ───────────────────────

  it("scoringPlugin does not define onStart or onStop", () => {
    // Access the plugin spec; both lifecycle hooks should be absent
    const spec = scoringPlugin as unknown as Record<string, unknown>;
    expect(spec.onStart).toBeUndefined();
    expect(spec.onStop).toBeUndefined();
  });
});
