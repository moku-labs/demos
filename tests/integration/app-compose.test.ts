/**
 * @file Web app composition smoke test — boots the Node build app (`makeApp`) and asserts the
 * `cli` surface used by `scripts/build.ts` is wired (build/serve/preview/deploy). This is the only
 * coverage for `src/app.ts` + `src/config.ts`; the actual `cli.build()` runs in `bun run build`.
 */
import { describe, expect, it } from "vitest";
import { app, makeApp } from "../../src/app";
import { SITE } from "../../src/config";

describe("web app composition", () => {
  it("exports a started-app singleton with the cli surface", () => {
    expect(typeof app.cli.build).toBe("function");
    expect(typeof app.cli.serve).toBe("function");
    expect(typeof app.start).toBe("function");
  });

  it("makeApp composes a fresh app per stage", () => {
    const testApp = makeApp("test");
    expect(typeof testApp.cli.build).toBe("function");
    expect(typeof testApp.cli.preview).toBe("function");
  });

  it("carries the SITE identity", () => {
    expect(SITE.name).toBe("Tracker");
    expect(SITE.url).toMatch(/^https:\/\//);
  });
});
