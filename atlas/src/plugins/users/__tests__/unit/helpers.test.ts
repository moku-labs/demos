/* eslint-disable unicorn/no-null -- the users `color` column is nullable by contract */
import { describe, expect, it } from "vitest";
import type { UserRow } from "../../helpers";
import { DEFAULT_COLORS, defaultColorFor, rowToUser } from "../../helpers";

// ---------------------------------------------------------------------------
// Unit tests: row mapping + default-colour picker (pure helpers)
// ---------------------------------------------------------------------------

describe("rowToUser", () => {
  it("maps snake_case columns to camelCase fields", () => {
    const row: UserRow = {
      id: "u_1",
      name: "Ada",
      color: "--label-green",
      created_at: 1000,
      updated_at: 2000
    };

    expect(rowToUser(row)).toEqual({
      id: "u_1",
      name: "Ada",
      color: "--label-green",
      createdAt: 1000,
      updatedAt: 2000
    });
  });

  it("preserves a null colour", () => {
    const row: UserRow = { id: "u_2", name: "Bo", color: null, created_at: 5, updated_at: 6 };

    expect(rowToUser(row).color).toBeNull();
  });
});

describe("defaultColorFor", () => {
  it("returns a token from the DEFAULT_COLORS palette", () => {
    for (const id of ["u_alice", "u_bob", "u_carol", "u_", "x"]) {
      expect(DEFAULT_COLORS).toContain(defaultColorFor(id));
    }
  });

  it("is deterministic for the same id", () => {
    expect(defaultColorFor("u_alice")).toBe(defaultColorFor("u_alice"));
  });

  it("spreads different ids across more than one palette token", () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => defaultColorFor(`u_${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("never returns the empty string (always a usable token)", () => {
    expect(defaultColorFor("").length).toBeGreaterThan(0);
  });
});

describe("DEFAULT_COLORS", () => {
  it("is a non-empty palette of CSS custom-property tokens", () => {
    expect(DEFAULT_COLORS.length).toBeGreaterThan(0);
    for (const token of DEFAULT_COLORS) expect(token.startsWith("--")).toBe(true);
  });
});
