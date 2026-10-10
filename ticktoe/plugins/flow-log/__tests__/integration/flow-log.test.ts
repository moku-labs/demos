/**
 * @file The plugin `flowLog` in a real app: a tiny flow with one node that throws, played without
 * a screen. The runner emits `flow:error` for every failure, and the plugin turns each one into an
 * error entry of the log. The log runs in its mode `test`, so nothing is printed.
 */
import { createApp, defineGame, type } from "@moku-labs/game";
import { createHeadless, fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { flowLogPlugin } from "../../index";

type Player = { visits: number };
type Session = { steps: number };

const { defineNode, defineFlow } = defineGame<{
  player: Player;
  session: Session;
  assets: string;
  strings: Record<string, never>;
}>();

/** The start and the safe node: the graph comes back here when a transition keeps failing. */
const lobby = defineNode({ outcomes: { enter: type() }, rest: true, checkpoint: true });

/** A second rest point, so the first failure and the second go back to different places. */
const room = defineNode({
  outcomes: { step: type(), crash: type(), mumble: type(), leave: type() },
  rest: true
});

/** A transition that works. */
const walk = defineNode({
  outcomes: { done: type() },
  run: ({ session, out }) => {
    session.steps += 1;

    return out.done();
  }
});

/** A transition that throws an error, after a write the rollback takes back. */
const broken = defineNode({
  outcomes: { done: type() },
  run: ({ session }) => {
    session.steps += 100;

    throw new Error("The node is broken.");
  }
});

/** A transition that throws something that is no error. */
const mumbling = defineNode({
  outcomes: { done: type() },
  run: () => {
    // A node may throw anything, not only an error: the plugin has to take it.
    throw "out of cells";
  }
});

const mainFlow = defineFlow("main", {
  nodes: { lobby, room, walk, broken, mumbling },
  start: "lobby",
  edges: {
    lobby: { enter: "room" },
    room: { step: "walk", crash: "broken", mumble: "mumbling", leave: "lobby" },
    walk: { done: "room" },
    broken: { done: "room" },
    mumbling: { done: "room" }
  }
});

/** The configs every app of this file runs on: a fresh save, a fake clock, a quiet log. */
function configs() {
  return {
    model: {
      playerProvider: memory(),
      initialPlayer: { visits: 0 },
      initialSession: { steps: 0 },
      seed: 1
    },
    clock: { source: fakeClock(1_000_000) },
    flow: { mainFlow },
    log: { mode: "test" as const }
  };
}

/**
 * Lets the runner take every step that is ready.
 *
 * @returns A promise that settles in the next task.
 */
function settle(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Starts the tiny flow with the plugin and walks it into the room.
 *
 * @returns The app, the runner resting at `room`, and a reader of the logged errors.
 */
async function inRoom() {
  const app = createApp({ plugins: [flowLogPlugin], pluginConfigs: configs() });
  const run = await createHeadless(app);

  run.answer({ intent: "enter" });
  await settle();

  return {
    app,
    run,
    errors: () => app.log.trace().filter(entry => entry.level === "error")
  };
}

describe("flowLog in an app", () => {
  it("writes one error entry with the path when a transition throws", async () => {
    const { run, errors } = await inRoom();

    expect(run.answer({ intent: "crash" })).toBe(true);
    await settle();

    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toMatchObject({
      level: "error",
      event: "flow:error",
      data: {
        path: "broken",
        rolledBackTo: "room",
        retry: true,
        error: { message: "The node is broken." }
      }
    });

    await run.stop();
  });

  it("keeps the stack of the error, so the entry points at the line that threw", async () => {
    const { run, errors } = await inRoom();

    run.answer({ intent: "crash" });
    await settle();

    expect(errors()[0]?.data).toMatchObject({
      error: { stack: expect.stringContaining("flow-log.test.ts") }
    });

    await run.stop();
  });

  it("writes a second entry when the retry fails too: the safe node, no retry", async () => {
    const { app, run, errors } = await inRoom();

    run.answer({ intent: "crash" });
    await settle();

    // The first failure went back to the rest point, with the write of the node undone.
    expect(run.state().path).toBe("room");
    expect(app.model.store.snapshot().session).toEqual({ steps: 0 });

    run.answer({ intent: "crash" });
    await settle();

    expect(run.state().path).toBe("lobby");
    expect(errors().map(entry => entry.event)).toEqual(["flow:error", "flow:error"]);
    expect(errors()[1]?.data).toMatchObject({
      path: "broken",
      rolledBackTo: "lobby",
      retry: false,
      error: { message: "The node is broken." }
    });

    await run.stop();
  });

  it("writes nothing for a transition that works", async () => {
    const { app, run, errors } = await inRoom();

    for (let time = 0; time < 3; time += 1) {
      run.answer({ intent: "step" });
      await settle();
    }

    expect(app.model.store.snapshot().session).toEqual({ steps: 3 });
    expect(errors()).toEqual([]);

    await run.stop();
  });

  it("logs what a node threw when that is no error", async () => {
    const { run, errors } = await inRoom();

    run.answer({ intent: "mumble" });
    await settle();

    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toMatchObject({
      event: "flow:error",
      data: {
        path: "mumbling",
        rolledBackTo: "room",
        retry: true,
        error: { message: "out of cells" }
      }
    });

    await run.stop();
  });

  it("logs a failure of a stage before the node runs, as the same entry", async () => {
    const { app, run, errors } = await inRoom();

    app.flow.onEnter("load", info => {
      if (info.path === "walk") throw new Error("The load failed.");
    });
    run.answer({ intent: "step" });
    await settle();

    expect(run.state().path).toBe("room");
    expect(errors()).toHaveLength(1);
    expect(errors()[0]?.data).toMatchObject({
      path: "walk",
      rolledBackTo: "room",
      retry: true,
      error: { message: "The load failed." }
    });

    await run.stop();
  });

  it("lets the game go on after the entries: the room takes a step again", async () => {
    const { app, run, errors } = await inRoom();

    run.answer({ intent: "crash" });
    await settle();
    run.answer({ intent: "step" });
    await settle();

    expect(run.state().path).toBe("room");
    expect(app.model.store.snapshot().session).toEqual({ steps: 1 });
    expect(errors()).toHaveLength(1);

    await run.stop();
  });
});
