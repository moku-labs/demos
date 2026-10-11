/**
 * @file Test helpers of the sound: a stand-in for the audio context of a browser, the first touch
 * that unlocks it, and the whole game on a screen app that plays through it. No sound card is
 * touched: the stand-in keeps what the audio plugin decoded and started, and the journal of the
 * plugin says which keys those were.
 */
import type { Audio } from "@moku-labs/game";
import { vi } from "vitest";
import game from "../../index";
import { diskIo, diskManifest } from "./disk-io";

/** One frame of the tests: 60 per second. */
export const FRAME_MS = 16;

/** How many frames a walk to a node may take before the test gives up. */
const PATIENCE = 400;

/** How many started sounds the journal keeps: more than any test of this game starts. */
const JOURNAL = 64;

/** The screen app of the game, as `game.screen()` builds it. */
export type ScreenApp = ReturnType<typeof game.screen>["app"];

/** One source the stand-in started: how many bytes its file had, and whether it loops. */
export type Started = { bytes: number; loop: boolean };

/** What the stand-in hands a source as its decoded sound: the size of the file it came from. */
type Decoded = { bytes: number };

/**
 * A gain node that takes every schedule and connects to anything.
 *
 * @returns The stand-in.
 */
function gainNode() {
  return {
    gain: {
      value: 1,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined
    },
    connect: () => undefined,
    disconnect: () => undefined
  };
}

/**
 * What a test may ask of the stand-in. With `holdResume` the context does not run when the first
 * touch asks it to, only when the test calls `letRun()`, the way a slow browser answers late.
 * With `running` the context runs from its creation, the way a shell that wants no gesture hands
 * it out: a native webview with the gesture requirement off.
 */
export type FakeAudioOptions = { holdResume?: boolean; running?: boolean };

/** The gestures a browser waits for before it lets a page sound. */
const GESTURES = ["pointerdown", "touchend"] as const;

/**
 * Builds a stand-in for the audio context of a browser that wants a gesture. Like a real one it
 * starts suspended, and a `resume()` asked before the first gesture on the page stays pending:
 * it is answered when that gesture comes. It decodes nothing: a "decoded" sound is the size of
 * its file, and every source that is started is kept in `started`. Build it after the `window`
 * of the test is there: the stand-in hears the gestures on it.
 *
 * @param options - Whether `resume()` waits for `letRun()`, and whether the context runs at once.
 * @returns The context for the seam `game.screen({ audio })`, what it started, and `letRun`.
 */
export function fakeAudio(options: FakeAudioOptions = {}) {
  const started: Started[] = [];
  const run = {
    state: options.running === true ? "running" : "suspended",
    touched: false,
    waiting: [] as (() => void)[]
  };
  const letRun = () => {
    run.state = "running";
    for (const answer of run.waiting.splice(0)) answer();
  };
  const page = (globalThis as { window?: EventTarget }).window;

  for (const gesture of GESTURES) {
    page?.addEventListener(gesture, () => {
      run.touched = true;
      // The gesture lets a `resume()` that waited for it through, unless the test holds it.
      if (options.holdResume !== true) letRun();
    });
  }
  const context = {
    destination: {},
    currentTime: 0,
    get state() {
      return run.state;
    },
    createGain: gainNode,
    createBufferSource: () => {
      const source = {
        buffer: undefined as Decoded | undefined,
        loop: false,
        connect: () => undefined,
        start: () => {
          started.push({ bytes: source.buffer?.bytes ?? 0, loop: source.loop });
        },
        stop: () => undefined
      };

      return source;
    },
    decodeAudioData: async (bytes: ArrayBuffer): Promise<Decoded> => ({ bytes: bytes.byteLength }),
    createMediaElementSource: () => {
      throw new Error("The stand-in plays no stream: the game decodes its music.");
    },
    resume: () => {
      if (run.touched && options.holdResume !== true) letRun();

      return run.state === "running"
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            run.waiting.push(resolve);
          });
    },
    close: async () => {
      run.state = "closed";
    }
  };

  return { context: context as unknown as Audio.AudioContextLike, started, letRun };
}

/**
 * Lets every ready promise and timer of the graph run.
 *
 * @returns A promise that settles in the next task.
 */
export function settle(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Steps frames of 16 ms and lets the graph take a turn after each one.
 *
 * @param app - The screen app.
 * @param count - How many frames.
 */
export async function frames(app: ScreenApp, count = 1): Promise<void> {
  for (let step = 0; step < count; step += 1) {
    app.time.step(FRAME_MS);
    await settle();
  }
}

/**
 * Steps frames until the graph stands on a node.
 *
 * @param app - The screen app.
 * @param path - The path of the node.
 */
export async function until(app: ScreenApp, path: string): Promise<void> {
  for (let step = 0; step < PATIENCE; step += 1) {
    if (app.flow.state().path === path) return;

    await frames(app);
  }

  throw new Error(`The graph never reached "${path}": it stands on "${app.flow.state().path}".`);
}

/**
 * A pointer that goes down on the page: the gesture a browser waits for before it lets a page
 * sound. The audio plugin listens for it on `window`, which `startSounding` put there.
 */
export function pointerDown(): void {
  globalThis.window.dispatchEvent(new Event("pointerdown"));
}

/**
 * The first touch of the player, and every step it makes ready.
 */
export async function touch(): Promise<void> {
  pointerDown();
  await settle();
}

/**
 * A tap on an element of a projection, through the input door, then every step that is ready.
 *
 * @param app - The screen app.
 * @param projection - The name of the projection.
 * @param key - The key of the element.
 * @returns Whether the input took the tap.
 */
export async function tap(app: ScreenApp, projection: string, key: string): Promise<boolean> {
  const taken = app.input.tap({ projection, key });

  await settle();

  return taken;
}

/**
 * The keys of the sounds that started, oldest first.
 *
 * @param app - The screen app.
 * @returns The asset keys, one per started sound.
 */
export function heard(app: ScreenApp): string[] {
  return app.audio.journal().map(entry => entry.key);
}

/**
 * What the app logged about its sound: every entry of the audio plugin, and every failed effect
 * handler. A missing file, a sound that did not decode and an unknown bus all end up here.
 *
 * @param app - The screen app.
 * @returns The names of the entries.
 */
export function audioComplaints(app: ScreenApp): string[] {
  return app.log
    .trace()
    .map(entry => entry.event)
    .filter(event => event.startsWith("audio:") || event === "flow:fx-handler-failed");
}

/**
 * Starts the real game live, as the page does, with a stand-in for the audio context and a
 * `window` the first touch can land on. The graph runs; the splash entrance has not played yet.
 * A test calls `vi.unstubAllGlobals()` when it is done, so the next one starts without a window.
 *
 * @param options - What the stand-in is asked: see `FakeAudioOptions`.
 * @returns The app, its fake clock, what the stand-in started, `letRun` for a held context, and
 *   the way to stop the game.
 */
export async function startSounding(options: FakeAudioOptions = {}) {
  // Plain Bun has no window, and without one the audio plugin never unlocks.
  vi.stubGlobal("window", new EventTarget());

  const audio = fakeAudio(options);
  const { app, clock } = game.screen({
    manifest: diskManifest(),
    io: diskIo(),
    audio: { context: () => audio.context, journal: JOURNAL }
  });

  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  return {
    app,
    clock,
    started: audio.started,
    letRun: audio.letRun,
    stop: async () => {
      await app.stop();
      await graph;
    }
  };
}
