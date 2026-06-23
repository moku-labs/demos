/**
 * @file Unit tests for the human-readable `{n}-{slug}` id generator (#14) — slugify normalization and
 * the monotonic, always-unique id builder.
 */
import { describe, expect, it } from "vitest";
import { nextHumanId, slugify } from "../../src/lib/slug";

describe("slugify", () => {
  it("lowercases, hyphenates words, and strips punctuation", () => {
    expect(slugify("Fix flaky WebSocket reconnect!")).toBe("fix-flaky-websocket-reconnect");
  });

  it("collapses separator runs and trims edges", () => {
    expect(slugify("  Hello___World !! ")).toBe("hello-world");
  });

  it("folds diacritics", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("falls back to 'untitled' for symbol-only input", () => {
    expect(slugify("???")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });

  it("clamps long titles and leaves no trailing hyphen", () => {
    const slug = slugify(`${"word ".repeat(40)}`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("nextHumanId", () => {
  it("starts at 1 over seed (non-numeric) ids", () => {
    expect(nextHumanId("Platform redesign", ["issue-ws-reconnect"])).toBe("1-platform-redesign");
  });

  it("increments past the highest numeric prefix", () => {
    expect(nextHumanId("New one", ["1-a", "7-b", "3-c"])).toBe("8-new-one");
  });

  it("is unique even when the slug already exists", () => {
    const id = nextHumanId("Dup", ["5-dup", "2-other"]);
    expect(id).toBe("6-dup");
    expect(["5-dup", "2-other"]).not.toContain(id);
  });

  it("handles an empty taken set", () => {
    expect(nextHumanId("First issue", [])).toBe("1-first-issue");
  });
});
