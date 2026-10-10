/**
 * @file The plugin `loadProgress` in a real screen app: the assets plugin loads a manifest through
 * an in-memory `io`, and a rest node of a tiny flow receives `progress` and `ready` from the inbox.
 * No renderer mount: the renderer is inert, the assets plugin still loads because `io` is given.
 */
import type { BundleKey } from "@generated/assets";
import { type Assets, createApp, defineGame, screen, type } from "@moku-labs/game";
import { createHeadless, fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it, vi } from "vitest";
import { loadProgressPlugin } from "../../index";

type Player = { visits: number };
type Session = { pcts: number[] };

const { defineNode, defineFlow } = defineGame<{
  player: Player;
  session: Session;
  assets: string;
  strings: Record<string, never>;
}>();

/** The splash of the test: it rests until the inbox brings `progress` or `ready`. */
const wait = defineNode({
  outcomes: { progress: type<{ pct: number }>(), ready: type() },
  rest: true,
  inbox: ["progress", "ready"]
});

/** Writes every delivered fraction into the session, so the test reads what the node received. */
const record = defineNode({
  input: type<{ pct: number }>(),
  outcomes: { stay: type() },
  run: ({ input, session, out }) => {
    session.pcts.push(input.pct);
    return out.stay();
  }
});

/** Where `ready` leads. */
const loaded = defineNode({ outcomes: { again: type() }, rest: true });

const mainFlow = defineFlow("main", {
  nodes: { wait, record, loaded },
  start: "wait",
  edges: {
    wait: { progress: "record", ready: "loaded" },
    record: { stay: "wait" },
    loaded: { again: "wait" }
  }
});

/**
 * One loose texture file of a manifest bundle.
 *
 * @param key - The asset key.
 * @returns The manifest entry.
 */
function file(key: string): Assets.ManifestFile {
  return { key, path: `${key}.png`, width: 1, height: 1, mb: 0.01 };
}

/**
 * A manifest of two bundles of the tier `core`, which the assets plugin loads on start without
 * awaiting them, and one `lazy` bundle nobody loads until it is asked for.
 *
 * @returns The parsed manifest.
 */
function manifestOf(): Assets.Manifest {
  return {
    version: 1,
    bundles: {
      extra: { feature: "extra", tier: "lazy", mb: 0.01, files: [file("extra.a")] },
      match: {
        feature: "match",
        tier: "core",
        mb: 0.04,
        files: [file("match.a"), file("match.b"), file("match.c"), file("match.d")]
      },
      stage: { feature: "stage", tier: "core", mb: 0.02, files: [file("stage.a"), file("stage.b")] }
    }
  };
}

/**
 * The in-memory I/O seam: every file is served from memory and no texture reaches a GPU.
 *
 * @returns The seam.
 */
function memoryIo(): Assets.AssetsIo {
  return {
    fetch: async () => new Response("png"),
    decode: async () => ({ width: 1, height: 1 }) as unknown as ImageBitmap,
    createTexture: () => ({}) as unknown as Assets.Texture,
    sliceTexture: () => ({}) as unknown as Assets.Texture,
    destroyTexture: () => {}
  };
}

/**
 * Composes the screen set and the plugin over the tiny flow.
 *
 * The manifest of this file has bundles of its own, `stage` and `extra`, which the game does not
 * have. The plugin only compares names, so the one cast below hands them in as bundle keys.
 *
 * @param config - The plugin config of this app.
 * @param config.bundles - The bundles `ready` waits for, by their names in the manifest above.
 * @param config.step - The smallest growth that posts.
 * @returns The app, not started.
 */
function appOf(config: { bundles: readonly string[]; step: number }) {
  const loadProgress = { ...config, bundles: config.bundles as readonly BundleKey[] };

  return createApp({
    plugins: [...screen, loadProgressPlugin],
    pluginConfigs: {
      model: {
        playerProvider: memory(),
        initialPlayer: { visits: 0 },
        initialSession: { pcts: [] },
        seed: 1
      },
      clock: { source: fakeClock(1_000_000) },
      flow: { mainFlow },
      assets: { manifest: manifestOf(), io: memoryIo() },
      // The rest nodes of the tiny flow name no scene, and the screen set warns about each one.
      // The log runs in its mode `test`: the trace keeps the warnings, nothing prints them.
      log: { mode: "test" as const },
      loadProgress
    }
  });
}

/**
 * Reads the fractions the node `record` wrote. The store answers the session as plain JSON, so the
 * shape is narrowed here instead of cast.
 *
 * @param app - The running app.
 * @returns The delivered fractions, oldest first.
 */
function pctsOf(app: ReturnType<typeof appOf>): number[] {
  const session = app.model.store.snapshot().session;

  if (typeof session !== "object" || session === null || Array.isArray(session)) return [];

  const pcts = session.pcts;

  return Array.isArray(pcts) ? pcts.filter(pct => typeof pct === "number") : [];
}

describe("loadProgress in a screen app", () => {
  it("delivers ready to the rest node when both configured bundles are loaded", async () => {
    const app = appOf({ bundles: ["match", "stage"], step: 0.25 });
    const run = await createHeadless(app);

    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    expect(app.assets.isLoaded("match")).toBe(true);
    expect(app.assets.isLoaded("stage")).toBe(true);

    await run.stop();
  });

  it("delivers the full bar before ready", async () => {
    const app = appOf({ bundles: ["match", "stage"], step: 0.25 });
    const run = await createHeadless(app);

    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    const pcts = pctsOf(app);

    expect(pcts.at(-1)).toBe(1);
    expect(pcts).toEqual(pcts.toSorted((left, right) => left - right));

    await run.stop();
  });

  it("keeps waiting while one configured bundle is not loaded", async () => {
    const app = appOf({ bundles: ["match", "stage", "extra"], step: 0.25 });
    const run = await createHeadless(app);

    await vi.waitFor(() => expect(app.assets.isLoaded("stage")).toBe(true));
    await vi.waitFor(() => expect(app.assets.isLoaded("match")).toBe(true));
    expect(run.state().path).toBe("wait");

    await app.assets.load("extra");
    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    expect(pctsOf(app).at(-1)).toBe(1);

    await run.stop();
  });

  it("ignores the bundles it was not asked to wait for", async () => {
    const app = appOf({ bundles: ["stage"], step: 1 });
    const run = await createHeadless(app);

    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    expect(pctsOf(app)).toEqual([1]);

    await run.stop();
  });

  it("delivers ready on start when no bundle is configured", async () => {
    const app = appOf({ bundles: [], step: 0.25 });
    const run = await createHeadless(app);

    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    expect(pctsOf(app)).toEqual([]);

    await run.stop();
  });

  it("rejects an unknown key of its config, so a typo cannot empty the bundle list", async () => {
    const app = createApp({
      plugins: [...screen, loadProgressPlugin],
      pluginConfigs: {
        model: {
          playerProvider: memory(),
          initialPlayer: { visits: 0 },
          initialSession: { pcts: [] },
          seed: 1
        },
        clock: { source: fakeClock(1_000_000) },
        flow: { mainFlow },
        log: { mode: "test" as const },
        // @ts-expect-error — `bundle` is not a key of the config: the key is `bundles`.
        loadProgress: { bundle: ["match"] }
      }
    });
    const run = await createHeadless(app);

    // The defaults stay in force: `bundles: []`, so `ready` comes on start.
    await vi.waitFor(() => expect(run.state().path).toBe("loaded"));

    await run.stop();
  });
});
