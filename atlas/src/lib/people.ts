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
 * Dynamically-registered people — signed-in {@link User}s resolved to {@link Person}s (with their
 * chosen avatar `color`), keyed by id. Populated CLIENT-SIDE by `lib/users` after a fetch; stays empty
 * in the server/SSR graph (the worker never registers), so SSR resolves the static cast only (#6).
 */
const dynamicPeople = new Map<string, Person>();

/**
 * Register signed-in users into the dynamic people registry so {@link personById} / {@link allPeople}
 * resolve them everywhere assignees + reporters render. Idempotent (re-registering an id overwrites).
 *
 * @param people - The people to register (a signed-in user resolved to a `Person` with its colour).
 * @example
 * ```ts
 * registerPeople(users.map(userToPerson));
 * ```
 */
export function registerPeople(people: readonly Person[]): void {
  for (const person of people) dynamicPeople.set(person.id, person);
}

/**
 * Looks up a person by id — the static demo cast first, then any dynamically-registered signed-in user.
 *
 * @param id - The person id to resolve (e.g. `"ak"` or a `u_…` user id).
 * @returns The matching {@link Person}, or `undefined` when no person has that id.
 * @example
 * ```ts
 * personById("ak"); // { id: "ak", name: "Anya Kovač", initials: "AK" }
 * personById("nope"); // undefined
 * ```
 */
export function personById(id: string): Person | undefined {
  return PEOPLE.find(person => person.id === id) ?? dynamicPeople.get(id);
}

/**
 * Every selectable person — the static demo cast followed by the registered signed-in users — for the
 * assignee / reporter choosers. De-duplicated by id (a registered user never shadows a cast member).
 *
 * @returns The combined, de-duplicated list of people.
 * @example
 * ```ts
 * const options = allPeople().map(person => ({ value: person.id, label: person.name }));
 * ```
 */
export function allPeople(): Person[] {
  const seen = new Set(PEOPLE.map(person => person.id));
  const extras = [...dynamicPeople.values()].filter(person => !seen.has(person.id));
  return [...PEOPLE, ...extras];
}
