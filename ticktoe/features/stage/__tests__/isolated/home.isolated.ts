/**
 * @file Home alone, headless: its three nodes in the harness flow, answered by hand as the level
 * picker and Play answer them in the game.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { createHeadless, isolate } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { stageFeature } from "../../index";
import { settle, stageHarness } from "../fixtures/harness";

/** The path of a node of the harness flow, as the isolated app names it. */
const at = (node: string) => `stageHarness/${node}`;

/** A player who has played: a level of their own and a score. */
const returning: Player = { level: "easy", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 2 };

const homeOnly = isolate(stageFeature, {
  flow: stageHarness,
  player: startingPlayer,
  session: startingSession
});

/**
 * Starts Home alone and waits for its first rest.
 */
async function start(seams: { player?: Player; session?: Session } = {}) {
  const app = homeOnly(seams);
  const run = await createHeadless(app);

  return {
    app,
    run,
    player: () => app.model.store.snapshot().player as Player,
    session: () => app.model.store.snapshot().session as Session
  };
}

/** The app of a started test. */
type HomeApp = Awaited<ReturnType<typeof start>>["app"];

/**
 * Makes the way back from `after` fail, as a broken transition of the round would.
 */
function breakBack(app: HomeApp): () => void {
  return app.flow.onEnter("load", info => {
    if (info.path === at("back")) throw new Error("The way back is broken.");
  });
}

/**
 * The error entries of the log, as the engine wrote them.
 */
function failures(app: HomeApp) {
  return app.log
    .trace()
    .filter(entry => entry.level === "error")
    .map(entry => ({ event: entry.event, ...(entry.data as { path: string; retry: boolean }) }));
}

describe("Home, headless", () => {
  it("rests at home with Normal for a new player", async () => {
    const { run, player, session } = await start();

    expect(run.state().path).toBe(at("home"));
    expect(player().level).toBe("normal");
    expect(session().screen).toBe("home");

    await run.stop();
  });

  it("writes each level the picker answers and comes back to home", async () => {
    const { run, player } = await start();

    for (const level of ["hard", "easy", "normal"] as const) {
      const state = await run.walk([{ at: at("home"), intent: "setLevel", payload: { level } }]);

      expect(state.path).toBe(at("home"));
      expect(player().level).toBe(level);
    }

    await run.stop();
  });

  it("answers the level that is already selected too, and keeps it", async () => {
    const { run, player } = await start({ player: returning });

    const state = await run.walk([
      { at: at("home"), intent: "setLevel", payload: { level: "easy" } }
    ]);

    expect(state.path).toBe(at("home"));
    expect(player()).toEqual(returning);

    await run.stop();
  });

  it("keeps the saved level on an answer with a level outside the three", async () => {
    const { run, player } = await start({ player: returning });

    for (const payload of [{ level: "expert" }, { level: 3 }, {}, "hard"]) {
      expect(run.answer({ intent: "setLevel", payload })).toBe(true);
      await settle();

      expect(run.state().path).toBe(at("home"));
      expect(player().level).toBe("easy");
    }

    await run.stop();
  });

  it("keeps the saved level on an answer that carries nothing", async () => {
    const { run, player } = await start({ player: returning });

    expect(run.answer({ intent: "setLevel" })).toBe(true);
    await settle();

    expect(run.state().path).toBe(at("home"));
    expect(player().level).toBe("easy");

    await run.stop();
  });

  it("leaves on play: the screen is the Board and the score row shows the saved score", async () => {
    const { run, player, session } = await start({ player: returning });

    const state = await run.walk([{ at: at("home"), intent: "play" }]);

    expect(state.path).toBe(at("after"));
    expect(session().screen).toBe("board");
    expect(session().shownScore).toEqual(returning.score);
    expect(player()).toEqual(returning);

    await run.stop();
  });

  it("shows the score of a new player as three zeros", async () => {
    const stale: Session = { ...startingSession, shownScore: { you: 9, draws: 9, bot: 9 } };
    const { run, session } = await start({ session: stale });

    await run.walk([{ at: at("home"), intent: "play" }]);

    expect(session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });

    await run.stop();
  });

  it("takes no tap of the Board: only a level and play end the wait", async () => {
    const { run } = await start();

    expect(run.state().pending.gate).toEqual(["setLevel", "play"]);
    expect(run.answer({ intent: "tap", payload: { cell: 4 } })).toBe(false);
    expect(run.answer({ intent: "home" })).toBe(false);
    expect(run.answer({ intent: "recover" })).toBe(false);
    expect(run.state().path).toBe(at("home"));

    await run.stop();
  });

  it("opens the same gate again after every level, and writes nothing of its own", async () => {
    const { app, run, session } = await start();

    for (const level of ["hard", "easy"] as const) {
      const state = await run.walk([{ at: at("home"), intent: "setLevel", payload: { level } }]);

      expect(state.path).toBe(at("home"));
      expect(state.pending.gate).toEqual(["setLevel", "play"]);
      expect(app.flow.gate.state()).toEqual({
        open: true,
        allowed: ["setLevel", "play"],
        narrowed: false
      });
    }

    expect(session()).toEqual(startingSession);

    await run.stop();
  });
});

describe("Home as the safe node", () => {
  /** A session of the Board, at the result card: what a round leaves when it cannot be left. */
  const lost: Session = {
    ...startingSession,
    screen: "board",
    board: [1, 1, 1, 2, 2, 0, 0, 0, 0],
    turn: 2,
    result: "win",
    winLine: [0, 1, 2],
    botDueAt: 1_000_500,
    celebrateDueAt: 1_001_100,
    card: true
  };

  /**
   * Starts Home with the session of the Board and walks to `after`, where the round would be.
   * `leaveHome` puts the saved score on show on the way.
   */
  async function atAfter() {
    const started = await start({ player: returning, session: lost });

    // The failures to come are errors of the log. Its trace keeps them; nothing prints them.
    started.app.log.clearSinks();
    await started.run.walk([{ at: at("home"), intent: "play" }]);

    return started;
  }

  /**
   * Starts at `after` and lets the way back fail twice: the runner gives up and enters Home.
   */
  async function givenUp() {
    const started = await atAfter();
    const mend = breakBack(started.app);

    for (let failure = 0; failure < 2; failure += 1) {
      expect(started.run.answer({ intent: "again" })).toBe(true);
      await settle();
    }

    mend();

    return started;
  }

  it("is left alone by a first failure: the retry returns to the rest point, the round as it was", async () => {
    const { app, run, session } = await atAfter();
    const before = session();

    breakBack(app);
    expect(run.answer({ intent: "again" })).toBe(true);
    await settle();

    expect(run.state().path).toBe(at("after"));
    expect(session()).toEqual(before);
    expect(session().screen).toBe("board");

    await run.stop();
  });

  it("brings the session back to Home when the runner gives up, and rests with the gate of Home", async () => {
    const { run, session } = await givenUp();

    expect(run.state().path).toBe(at("home"));
    expect(run.state().pending.gate).toEqual(["setLevel", "play"]);
    expect(session()).toMatchObject({
      screen: "home",
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      result: "none",
      winLine: [],
      card: false,
      botDueAt: 0,
      celebrateDueAt: 0
    });

    await run.stop();
  });

  it("leaves one error entry per failure in the log: the retry, then the safe node", async () => {
    const { app, run } = await givenUp();

    expect(failures(app)).toMatchObject([
      { event: "flow:error", path: at("back"), rolledBackTo: at("after"), retry: true },
      { event: "flow:error", path: at("back"), retry: false }
    ]);
    expect(failures(app)).toHaveLength(2);

    await run.stop();
  });

  it("keeps the saved player and what the session holds outside the round", async () => {
    const { run, player, session } = await givenUp();

    expect(player()).toEqual(returning);
    expect(session().splash).toEqual(startingSession.splash);
    expect(session().shownScore).toEqual(returning.score);

    await run.stop();
  });

  it("then takes a level and Play as Home always does", async () => {
    const { run, player, session } = await givenUp();

    await run.walk([{ at: at("home"), intent: "setLevel", payload: { level: "hard" } }]);

    expect(player().level).toBe("hard");
    expect(session().screen).toBe("home");

    const state = await run.walk([{ at: at("home"), intent: "play" }]);

    expect(state.path).toBe(at("after"));
    expect(session().screen).toBe("board");
    expect(session().shownScore).toEqual(returning.score);

    await run.stop();
  });

  it("writes nothing on a plain entry: only a transition the runner gave up on is recovered", async () => {
    // Started with the session of the Board, and entered again by a way back that works: `after`
    // clears nothing. Home rests on what it was handed. In the game `leaveBoard` clears the round.
    const { app, run, session } = await start({ player: returning, session: lost });

    expect(run.state().path).toBe(at("home"));
    expect(session()).toEqual(lost);

    const state = await run.walk([
      { at: at("home"), intent: "play" },
      { at: at("after"), intent: "again" }
    ]);

    expect(state.path).toBe(at("home"));
    expect(session()).toMatchObject({ screen: "board", board: lost.board, card: true });
    expect(app.flow.gate.state().allowed).toEqual(["setLevel", "play"]);
    expect(failures(app)).toEqual([]);

    await run.stop();
  });
});
