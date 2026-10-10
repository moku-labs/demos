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
    expect(run.answer({ intent: "recovered" })).toBe(false);
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

describe("Home entered with the session of the Board", () => {
  /** What the safe node is entered with after a failure on the result card. */
  const lost: Session = {
    ...startingSession,
    screen: "board",
    board: [1, 1, 1, 2, 2, 0, 0, 0, 0],
    turn: 2,
    result: "win",
    winLine: [0, 1, 2],
    botDueAt: 1_000_500,
    celebrateDueAt: 1_001_100,
    card: true,
    shownScore: { you: 3, draws: 1, bot: 1 }
  };

  it("brings the session back to Home and rests there, with the gate of Home", async () => {
    const { run, session } = await start({ player: returning, session: lost });

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

  it("keeps the saved player and what the session holds outside the round", async () => {
    const { run, player, session } = await start({ player: returning, session: lost });

    expect(player()).toEqual(returning);
    expect(session().splash).toEqual(startingSession.splash);
    expect(session().shownScore).toEqual(lost.shownScore);

    await run.stop();
  });

  it("then takes a level and Play as Home always does", async () => {
    const { run, player, session } = await start({ player: returning, session: lost });

    await run.walk([{ at: at("home"), intent: "setLevel", payload: { level: "hard" } }]);

    expect(player().level).toBe("hard");
    expect(session().screen).toBe("home");

    const state = await run.walk([{ at: at("home"), intent: "play" }]);

    expect(state.path).toBe(at("after"));
    expect(session().screen).toBe("board");
    expect(session().shownScore).toEqual(returning.score);

    await run.stop();
  });

  it("brings it back every time, not only the first", async () => {
    const { app, run, session } = await start({ player: returning });

    expect(session().screen).toBe("home");

    // `after` stands where the round would be and clears nothing: on `again` it hands Home the
    // session of the Board, as a failed transition of the round does.
    for (let visit = 0; visit < 2; visit += 1) {
      const state = await run.walk([
        { at: at("home"), intent: "play" },
        { at: at("after"), intent: "again" }
      ]);

      expect(state.path).toBe(at("home"));
      expect(session().screen).toBe("home");
      expect(app.flow.gate.state().allowed).toEqual(["setLevel", "play"]);
    }

    await run.stop();
  });
});
