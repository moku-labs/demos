/**
 * @file The shared feature in a real screen app, with no canvas and the asset files read from disk:
 * i18n gets the messages of the whole game, and the built font has a glyph for all of them.
 */
import { readFileSync } from "node:fs";
import { defineFeature, defineFlow, defineNode, defineScene, projection, tr } from "@core/kit";
import { startingPlayer, startingSession } from "@core/state";
import type { StringKey } from "@generated/strings";
import enStrings from "@generated/strings.en";
import type { Assets } from "@moku-labs/game";
import { createApp, screen, type } from "@moku-labs/game";
import { startMoment } from "@moku-labs/game/app";
import { fakeClock } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { sharedFeature } from "../../index";

/** The root of the game: asset paths of the manifest start here. */
const root = new URL("../../../", import.meta.url);

/** The font file the game ships, as the text plugin reads it. */
const fnt = readFileSync(new URL("shared/assets/font-body.fnt", root), "utf8");

/** The advance of every glyph of the built font, in pixels at the size it was exported with. */
const advances = new Map(
  [...fnt.matchAll(/<char id="(\d+)"[^>]*xadvance="(-?\d+)"/g)].map(match => [
    String.fromCodePoint(Number(match[1])),
    Number(match[2])
  ])
);

/** One empty screen: the scene of the harness needs something to mount. */
const blankScreen = projection({
  name: "harness.blank",
  layer: "ui",
  from: () => ({}),
  view: () => ({ type: "screen", key: "blankScreen", props: {}, children: [] })
});

const blankScene = defineScene("stage", { bundle: "ui", layers: {}, projections: [blankScreen] });
const blankFeature = defineFeature("harness", { scenes: [blankScene], projections: [blankScreen] });

/** One rest node: all the graph a harness for a feature without nodes needs. */
const lobby = defineNode({ scene: "stage", outcomes: { again: type() }, rest: true });

const harnessFlow = defineFlow("sharedHarness", {
  nodes: { lobby },
  start: "lobby",
  edges: { lobby: { again: "lobby" } }
});

/**
 * Reads the manifest `bun run keys` wrote, the way the page hands it to the assets plugin.
 */
function readManifest(): Assets.Manifest {
  return JSON.parse(readFileSync(new URL("generated/manifest.json", root), "utf8"));
}

/**
 * The I/O of the assets plugin over the game folder: files come from disk, and since no canvas is
 * mounted a texture is a stand-in nobody draws.
 */
function diskIo(): Assets.AssetsIo {
  const image = { width: 1, height: 1 } as unknown as ImageBitmap;
  const texture = {} as unknown as Assets.Texture;

  return {
    fetch: async url => new Response(readFileSync(new URL(url.replace(/^\//, ""), root))),
    decode: async () => image,
    createTexture: () => texture,
    sliceTexture: () => texture,
    destroyTexture: () => undefined
  };
}

/**
 * Builds the screen app around the shared feature and the empty screen. No canvas is mounted, so
 * the renderer is inert; everything else runs as on the page.
 */
function buildScreen() {
  return createApp({
    plugins: [...screen, sharedFeature, blankFeature],
    pluginConfigs: {
      clock: { source: fakeClock(startMoment) },
      model: { seed: 42, initialPlayer: startingPlayer, initialSession: startingSession },
      flow: { mainFlow: harnessFlow },
      text: { fonts: { body: "ui.font-body", digits: "ui.font-body" } },
      assets: { manifest: readManifest(), io: diskIo() }
    }
  });
}

/**
 * Starts the screen app live, runs the graph and a few frames, so the scene is mounted and laid out.
 */
async function playScreen() {
  const app = buildScreen();

  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  for (let frame = 0; frame < 6; frame += 1) {
    app.time.step(16);
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return {
    app,
    stop: async () => {
      await app.stop();
      await graph;
    }
  };
}

describe("shared feature on the screen", () => {
  it("has a glyph in the font for every character the game writes, and for every digit", async () => {
    const { app, stop } = await playScreen();
    const keys = Object.keys(enStrings) as StringKey[];
    const written = `${keys.map(key => app.i18n.plain(tr(key))).join("")}0123456789`;

    expect(keys.length).toBeGreaterThan(0);
    expect([...new Set(written)].filter(char => !advances.has(char))).toEqual([]);

    await stop();
  });
});
