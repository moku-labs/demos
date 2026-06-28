/**
 * @file Unit tests for the reuse map (`src/lib/sound/map.ts`) — the table that lets ~12 samples cover
 * ~34 cues. Invariants: every cue resolves to a *real* generated asset, the pitch/reverse tweaks that
 * define the reuse are correct, and every generated sample is actually used (no dead files).
 */
import { describe, expect, it } from "vitest";
import { ASSET_IDS } from "../../../src/lib/sound/assets";
import { resolveSfx, SFX_MAP } from "../../../src/lib/sound/map";
import type { SfxId } from "../../../src/lib/sound/types";

const ALL_CUES = Object.keys(SFX_MAP) as SfxId[];

describe("SFX_MAP", () => {
  it("resolves every cue to a real generated asset", () => {
    for (const cue of ALL_CUES) {
      expect(ASSET_IDS).toContain(resolveSfx(cue).asset);
    }
  });

  it("uses positive playback rates where a static pitch is set", () => {
    for (const cue of ALL_CUES) {
      const { rate } = resolveSfx(cue);
      if (rate !== undefined) expect(rate).toBeGreaterThan(0);
    }
  });

  it("references every generated sample (no dead files)", () => {
    const used = new Set(ALL_CUES.map(c => resolveSfx(c).asset));
    for (const asset of ASSET_IDS) expect(used).toContain(asset);
  });

  it("encodes the key reuse tweaks", () => {
    expect(resolveSfx("ui.back")).toEqual({ asset: "tap", rate: 0.82 });
    expect(resolveSfx("join.leave")).toEqual({ asset: "pop", reverse: true });
    expect(resolveSfx("join.pop").asset).toBe("pop");
    expect(resolveSfx("reveal.correct").asset).toBe("correct");
    expect(resolveSfx("steal.success")).toEqual({ asset: "correct", rate: 1.14 });
  });
});
