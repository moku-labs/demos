/**
 * @file Unit tests for the static asset URL manifest (`src/lib/sound/assets.ts`). The loader fetches
 * these paths, so the guarantee is simply: one-shots resolve to `/sfx/{id}.mp3`, and a bed id's `bed.`
 * prefix is stripped to its file name.
 */
import { describe, expect, it } from "vitest";
import { ASSET_IDS, assetUrl, musicUrl } from "../../../src/lib/sound/assets";

describe("assetUrl", () => {
  it("serves every one-shot from /sfx as an mp3", () => {
    expect(assetUrl("tap")).toBe("/sfx/tap.mp3");
    for (const id of ASSET_IDS) expect(assetUrl(id)).toBe(`/sfx/${id}.mp3`);
  });
});

describe("musicUrl", () => {
  it("strips the `bed.` prefix to the served file name", () => {
    expect(musicUrl("bed.lobby")).toBe("/sfx/lobby.mp3");
    expect(musicUrl("bed.game")).toBe("/sfx/game.mp3");
    expect(musicUrl("bed.podium")).toBe("/sfx/podium.mp3");
  });
});
