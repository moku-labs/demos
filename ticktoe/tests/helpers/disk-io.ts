/**
 * @file The asset seams of a screen app in plain Bun: the parsed dev manifest and an I/O that reads
 * the game's asset files from disk. With them the real font is loaded, so text is measured as on
 * the page. A texture is a stand-in nobody draws.
 */
import { readFileSync } from "node:fs";
import type { Assets } from "@moku-labs/game";

/** The root of the game: the asset paths of the manifest start here. */
const root = new URL("../../", import.meta.url);

/**
 * Reads the dev manifest `bun run keys` wrote.
 *
 * @returns The parsed `generated/manifest.json`.
 */
export function diskManifest(): Assets.Manifest {
  return JSON.parse(
    readFileSync(new URL("generated/manifest.json", root), "utf8")
  ) as Assets.Manifest;
}

/**
 * The I/O of the assets plugin over the game folder.
 *
 * @returns The seam `game.screen({ io })` takes.
 */
export function diskIo(): Assets.AssetsIo {
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
