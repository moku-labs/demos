/**
 * @file Static demo cast — the people who appear as reporters and assignees across Atlas.
 *
 * Runtime-only constants with no platform imports, so this module is safe to pull into both the
 * `@moku-labs/web` client graph and the `@moku-labs/worker` server graph. The ids are canonical and
 * stable: other build steps (seed data, assignment UIs) reference them directly.
 */
import type { Person } from "./types";

/**
 * The four demo people. Ids are canonical and load-bearing — do not rename.
 *
 * @example
 * ```ts
 * PEOPLE.length; // 4
 * PEOPLE[0].name; // "Anya Kovač"
 * ```
 */
export const PEOPLE: readonly Person[] = [
  { id: "ak", name: "Anya Kovač", initials: "AK" },
  { id: "ml", name: "Mateo Luna", initials: "ML" },
  { id: "rt", name: "Robin Tao", initials: "RT" },
  { id: "js", name: "June Sato", initials: "JS" }
];

/**
 * Looks up a demo person by id.
 *
 * @param id - The person id to resolve (e.g. `"ak"`).
 * @returns The matching {@link Person}, or `undefined` when no person has that id.
 * @example
 * ```ts
 * personById("ak"); // { id: "ak", name: "Anya Kovač", initials: "AK" }
 * personById("nope"); // undefined
 * ```
 */
export function personById(id: string): Person | undefined {
  return PEOPLE.find(person => person.id === id);
}
