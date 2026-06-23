/**
 * @file Unit tests for the human-readable `{n}-{slug}` id generator (#14) — slugify normalization and
 * the monotonic, always-unique id builder.
 */
import { describe, expect, it } from "vitest";
import { nextHumanId, slugify } from "../../src/lib/slug";

describe("slugify", () => {
  it("lowercases, hyphenates words, and strips punctuation (clamped short, on a word boundary)", () => {
    // Clamped to MAX_SLUG_LENGTH (24) on a whole-word boundary — "reconnect" would overflow, so it drops.
    expect(slugify("Fix flaky WebSocket reconnect!")).toBe("fix-flaky-websocket");
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

  it("keeps the slug short, clamped on a whole-word boundary (never mid-word, no trailing hyphen)", () => {
    const slug = slugify("Platform infrastructure observability redesign initiative");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
    // Only whole words survive the clamp — "observability" would overflow 24, so it stops at two words.
    expect(slug).toBe("platform-infrastructure");
  });

  it("hard-clamps a single over-long word", () => {
    const slug = slugify("Supercalifragilisticexpialidocious");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugify — always English (transliterates non-Latin scripts)", () => {
  it("romanises Ukrainian Cyrillic to ASCII", () => {
    expect(slugify("Привіт світ")).toBe("pryvit-svit");
    expect(slugify("Платформа")).toBe("platforma");
  });

  it("romanises Russian Cyrillic to ASCII", () => {
    expect(slugify("Привет мир")).toBe("pryvet-myr");
  });

  it("romanises Greek to ASCII", () => {
    expect(slugify("Δοκιμή")).toBe("dokimi");
  });

  it("produces only ASCII URL-safe characters from a mixed-script title", () => {
    const slug = slugify("Мобільний App 2.0");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain("app");
  });

  it("falls back to 'untitled' for an unmappable script (e.g. CJK)", () => {
    expect(slugify("こんにちは")).toBe("untitled");
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
