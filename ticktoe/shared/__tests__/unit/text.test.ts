/**
 * @file The text styles: the font they name, the digits a score style carries, and the name of the
 * style one tone of one size is drawn with. The sizes and the colours are the visual baselines'.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import manifest from "@generated/manifest.json";
import { describe, expect, it } from "vitest";
import { textStyles, toneStyle } from "../../styles/text";

describe("textStyles", () => {
  it("names a font the manifest has, with its files on disk", () => {
    const font = manifest.bundles.ui.files.find(file => file.key === "ui.font-body");
    const root = fileURLToPath(new URL("../../../", import.meta.url));

    expect(font?.kind).toBe("font");
    expect(font?.pages).toHaveLength(1);
    expect(existsSync(`${root}${font?.path}`)).toBe(true);
    expect(existsSync(`${root}${font?.pages?.[0]?.path}`)).toBe(true);
  });

  it("lets a score digit be bound to a counter", () => {
    const score = Object.entries(textStyles.map).filter(([key]) => key.startsWith("ui.score"));

    expect(score).toHaveLength(7);
    expect(score.every(([, style]) => style.digits)).toBe(true);
  });
});

describe("toneStyle", () => {
  it("names the one style of a size in a tone", () => {
    expect(toneStyle("ui.title", "coral")).toBe("ui.title.coral");
    expect(toneStyle("ui.turn", "maroon")).toBe("ui.turn.maroon");
    expect(toneStyle("ui.option", "cream")).toBe("ui.option.cream");
  });
});
