/**
 * @file Static asset manifest — the URLs the loader fetches. The processed samples live under
 * `public/sfx/` (copied to `dist/client/sfx/` by the web build's publicDir step) and are served at
 * `/sfx/{id}.mp3`. Pure data + a tiny URL helper; no WebAudio/DOM. Regenerate the files with
 * `scripts/process-sfx.sh`.
 */
import type { AssetId, MusicId } from "./types";

/** Root path the processed samples are served from (publicDir → ASSETS). */
const SFX_ROOT = "/sfx";

/** Every one-shot sample id (used to preload the small SFX buffers up front). */
export const ASSET_IDS: readonly AssetId[] = [
  "tap",
  "pop",
  "confirm",
  "sparkle",
  "whoosh",
  "impact",
  "correct",
  "wrong",
  "countup",
  "fanfare",
  "plucks",
  "sting"
];

/**
 * Served URL for a one-shot sample.
 *
 * @param id - The sample id.
 * @returns The `/sfx/{id}.mp3` URL.
 * @example
 * ```ts
 * assetUrl("tap"); // "/sfx/tap.mp3"
 * ```
 */
export function assetUrl(id: AssetId): string {
  return `${SFX_ROOT}/${id}.mp3`;
}

/**
 * Served URL for a music bed — the bed id's file is its suffix (`bed.lobby` → `/sfx/lobby.mp3`).
 *
 * @param id - The bed id.
 * @returns The `/sfx/{name}.mp3` URL.
 * @example
 * ```ts
 * musicUrl("bed.game"); // "/sfx/game.mp3"
 * ```
 */
export function musicUrl(id: MusicId): string {
  return `${SFX_ROOT}/${id.replace("bed.", "")}.mp3`;
}
