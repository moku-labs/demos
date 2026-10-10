/**
 * @file The splash alone, headless: its six nodes in the harness flow, a fake clock, and the inbox
 * events posted by hand, as `loadProgress` and the clock post them in the game.
 */
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import { startMoment } from "@moku-labs/game/app";
import { createHeadless, fakeClock, isolate } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { splashFeature } from "../../index";
import { settle, splashHarness, splashOf } from "../fixtures/harness";

/** The path of a node of the harness flow, as the isolated app names it. */
const at = (node: string) => `splashHarness/${node}`;

/** The moment the minimum time of a splash that began at the start moment has passed. */
const DUE = startMoment + tables.splash.minMs;

const splashOnly = isolate(splashFeature, {
  flow: splashHarness,
  player: startingPlayer,
  session: startingSession
});

/**
 * Starts the splash alone on a fake clock and waits for its first rest.
 */
async function start(session = startingSession) {
  const clock = fakeClock(startMoment);
  const app = splashOnly({ clock, session });
  const run = await createHeadless(app);

  return { app, clock, run };
}

/**
 * The nodes the graph went through and how each ended, oldest first.
 */
function walked(app: Awaited<ReturnType<typeof start>>["app"]): string[] {
  return app.flow
    .history()
    .map(entry => `${entry.path.replace("splashHarness/", "")}:${entry.outcome}`);
}

describe("the splash, headless", () => {
  it("starts from nothing, whatever the session held, and rests", async () => {
    const splash = { pct: 0.75, ready: true, minPassed: true, minDueAt: 1 };
    const { app, run } = await start({ ...startingSession, splash });

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app)).toEqual({ pct: 0, ready: false, minPassed: false, minDueAt: DUE });

    await run.stop();
  });

  it("arms the minimum time from the moment the entrance began", async () => {
    const { app, run } = await start();

    expect(tables.splash.minMs).toBe(2400);
    expect(DUE).toBe(startMoment + 2400);
    expect(app.clock.dueAt()).toBe(DUE);
    // The node keeps the moment it asked the clock for, so it can tell an early `elapsed`.
    expect(splashOf(app).minDueAt).toBe(DUE);

    await run.stop();
  });

  it("leaves on elapsed when ready came first and the clock then passes 2400 ms", async () => {
    const { app, clock, run } = await start();

    app.flow.inbox.post({ type: "ready" });
    await settle();

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });

    clock.advance(2399);
    await settle();

    expect(run.state().path).toBe(at("splashWait"));

    clock.advance(1);
    await settle();

    expect(run.state().path).toBe(at("after"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: true, minDueAt: DUE });
    expect(walked(app).slice(-4)).toEqual([
      "markReady:stay",
      "splashWait:elapsed",
      "markMinTime:leave",
      "splashOutro:done"
    ]);

    await run.stop();
  });

  it("leaves on ready when the clock passed 2400 ms first", async () => {
    const { app, clock, run } = await start();

    clock.advance(2400);
    await settle();

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app)).toEqual({ pct: 0, ready: false, minPassed: true, minDueAt: DUE });

    app.flow.inbox.post({ type: "ready" });
    await settle();

    expect(run.state().path).toBe(at("after"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: true, minDueAt: DUE });
    expect(walked(app).slice(-4)).toEqual([
      "markMinTime:stay",
      "splashWait:ready",
      "markReady:leave",
      "splashOutro:done"
    ]);

    await run.stop();
  });

  it("stays on an elapsed that comes before the minimum time, as a resume sends one", async () => {
    const { app, clock, run } = await start();

    app.flow.inbox.post({ type: "ready" });
    await settle();
    clock.advance(1000);
    // What a resume from the background does: the clock says `elapsed` with the moment it is.
    app.clock.poke();
    await settle();

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });
    // The moment the splash asked for is still armed: the early one took nothing from it.
    expect(app.clock.dueAt()).toBe(DUE);

    clock.advance(1399);
    app.clock.poke();
    await settle();

    expect(run.state().path).toBe(at("splashWait"));

    clock.advance(1);
    await settle();

    expect(run.state().path).toBe(at("after"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: true, minDueAt: DUE });
    expect(walked(app).slice(-7)).toEqual([
      "splashWait:elapsed",
      "markMinTime:stay",
      "splashWait:elapsed",
      "markMinTime:stay",
      "splashWait:elapsed",
      "markMinTime:leave",
      "splashOutro:done"
    ]);

    await run.stop();
  });

  it("does not count an early elapsed when the loading ends after it", async () => {
    const { app, clock, run } = await start();

    clock.advance(1000);
    app.clock.poke();
    await settle();

    expect(splashOf(app)).toEqual({ pct: 0, ready: false, minPassed: false, minDueAt: DUE });

    app.flow.inbox.post({ type: "ready" });
    await settle();

    expect(run.state().path).toBe(at("splashWait"));

    clock.advance(1400);
    await settle();

    expect(run.state().path).toBe(at("after"));

    await run.stop();
  });

  it("stays on an elapsed that names no moment: a gate answer is untyped", async () => {
    const { app, run } = await start();

    app.flow.inbox.post({ type: "ready" });
    await settle();

    expect(run.answer({ intent: "elapsed" })).toBe(true);
    await settle();

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });

    expect(run.answer({ intent: "elapsed", payload: { now: "late" } })).toBe(true);
    await settle();

    expect(run.state().path).toBe(at("splashWait"));
    expect(splashOf(app).minPassed).toBe(false);

    await run.stop();
  });

  it("stays on an elapsed whose moment is NaN, and leaves at its own moment", async () => {
    const { app, clock, run } = await start();

    app.flow.inbox.post({ type: "ready" });
    await settle();

    // NaN is a number, and it is not before the due moment: only "at or after" keeps it out.
    for (let time = 0; time < 2; time += 1) {
      expect(run.answer({ intent: "elapsed", payload: { now: Number.NaN } })).toBe(true);
      await settle();

      expect(run.state().path).toBe(at("splashWait"));
      expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });
    }

    clock.advance(tables.splash.minMs);
    await settle();

    expect(run.state().path).toBe(at("after"));
    expect(splashOf(app).minPassed).toBe(true);

    await run.stop();
  });

  it("only raises the fraction on progress, and never leaves on it", async () => {
    const { app, clock, run } = await start();
    const seen: number[] = [];

    clock.advance(2400);
    await settle();

    for (const pct of [0.25, 0.5, 0.75]) {
      app.flow.inbox.post({ type: "progress", payload: { pct } });
      await settle();
      seen.push(splashOf(app).pct);

      expect(run.state().path).toBe(at("splashWait"));
    }

    expect(seen).toEqual([0.25, 0.5, 0.75]);
    expect(splashOf(app)).toEqual({ pct: 0.75, ready: false, minPassed: true, minDueAt: DUE });
    expect(walked(app).filter(step => step.endsWith(":leave"))).toEqual([]);

    await run.stop();
  });

  it("never lowers the fraction", async () => {
    const { app, run } = await start();

    for (const pct of [0.75, 0.25]) {
      app.flow.inbox.post({ type: "progress", payload: { pct } });
      await settle();
    }

    expect(splashOf(app).pct).toBe(0.75);

    app.flow.inbox.post({ type: "ready" });
    await settle();
    app.flow.inbox.post({ type: "progress", payload: { pct: 0.5 } });
    await settle();

    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });
    expect(run.state().path).toBe(at("splashWait"));

    await run.stop();
  });

  it("keeps the fraction on a progress that names none: a gate answer is untyped", async () => {
    const { app, run } = await start();

    app.flow.inbox.post({ type: "progress", payload: { pct: 0.5 } });
    await settle();

    const nameless = [undefined, {}, { pct: "0.75" }, { pct: Number.NaN }, "half"];

    for (const payload of nameless) {
      // Twice: a node that threw twice would send the graph to the safe node.
      for (let time = 0; time < 2; time += 1) {
        const given =
          payload === undefined ? { intent: "progress" } : { intent: "progress", payload };

        expect(run.answer(given)).toBe(true);
        await settle();

        expect(run.state().path).toBe(at("splashWait"));
        expect(splashOf(app)).toEqual({ pct: 0.5, ready: false, minPassed: false, minDueAt: DUE });
      }
    }

    // The inbox takes an event without a payload too.
    app.flow.inbox.post({ type: "progress" });
    await settle();

    expect(splashOf(app).pct).toBe(0.5);
    expect(walked(app).filter(step => step.startsWith("splashIntro"))).toEqual([
      "splashIntro:done"
    ]);

    // And the bar still grows with the next step that names a fraction.
    app.flow.inbox.post({ type: "progress", payload: { pct: 0.75 } });
    await settle();

    expect(splashOf(app).pct).toBe(0.75);
    expect(run.state().path).toBe(at("splashWait"));

    await run.stop();
  });

  it("keeps what was posted while the entrance still played", async () => {
    const clock = fakeClock(startMoment);
    const app = splashOnly({ clock });

    // Posted before the graph runs: the inbox holds one entry per type until the splash rests.
    app.flow.inbox.post({ type: "progress", payload: { pct: 0.5 } });
    app.flow.inbox.post({ type: "ready" });

    const run = await createHeadless(app);

    await settle();

    expect(splashOf(app)).toEqual({ pct: 1, ready: true, minPassed: false, minDueAt: DUE });
    expect(run.state().path).toBe(at("splashWait"));

    await run.stop();
  });
});
