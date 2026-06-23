/**
 * @file Unit tests for the static demo cast and id lookup.
 */
import { describe, expect, it } from "vitest";
import { PEOPLE, personById } from "../../src/lib/people";

describe("PEOPLE", () => {
  it("contains exactly four people", () => {
    expect(PEOPLE).toHaveLength(4);
  });

  it("uses the canonical ids", () => {
    expect(PEOPLE.map(person => person.id)).toEqual(["ak", "ml", "rt", "js"]);
  });
});

describe("personById", () => {
  it("resolves a known id (hit)", () => {
    expect(personById("ak")).toEqual({ id: "ak", name: "Anya Kovač", initials: "AK" });
  });

  it("returns undefined for an unknown id (miss)", () => {
    expect(personById("nope")).toBeUndefined();
  });
});
