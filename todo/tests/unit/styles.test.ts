import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = new URL("../../src/components/", import.meta.url);
const STYLES_DIR = new URL("../../src/styles/", import.meta.url);

/** Every `@import "…"` path in a stylesheet, as written. */
function importsOf(sheet: string): string[] {
  const source = readFileSync(new URL(sheet, STYLES_DIR), "utf8");

  return [...source.matchAll(/@import\s+"([^"]+)"/g)].map(match => match[1] ?? "");
}

describe("styles/components.css", () => {
  it("imports every component stylesheet", () => {
    const sheets = readdirSync(COMPONENTS_DIR).filter(name => name.endsWith(".css"));
    const imported = new Set(importsOf("components.css"));

    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets.filter(name => !imported.has(`../components/${name}`))).toEqual([]);
  });

  it("imports only stylesheets that exist", () => {
    const missing = importsOf("components.css").filter(
      path => !existsSync(new URL(path, STYLES_DIR))
    );

    expect(missing).toEqual([]);
  });
});

describe("styles/main.css", () => {
  it("imports the layer order before any sheet", () => {
    expect(importsOf("main.css")[0]).toBe("./layers.css");
  });

  it("declares the cascade layers in order, animations included", () => {
    const source = readFileSync(new URL("layers.css", STYLES_DIR), "utf8");
    const statements = source.replaceAll(/\/\*[\s\S]*?\*\//g, "").match(/@layer[^;{]*;/g);

    expect(statements).toEqual(["@layer reset, tokens, base, components, animations, utilities;"]);
  });

  it("imports only stylesheets that exist", () => {
    const missing = importsOf("main.css").filter(path => !existsSync(new URL(path, STYLES_DIR)));

    expect(missing).toEqual([]);
  });
});
