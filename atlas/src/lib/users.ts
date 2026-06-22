/**
 * @file Client-side signed-in-user registry (#6: profile → assignable). Loads the persisted users
 * from the worker once, resolves them to {@link Person}s (carrying the chosen avatar `color`), and
 * registers them into `lib/people` so `personById` / `allPeople` resolve them everywhere assignees +
 * reporters render. Also owns the current user's cached profile + the profile save path. Browser-only
 * (it fetches); the static demo cast in `lib/people` is the server/SSR fallback.
 */
import { getMyProfile, listUsers, updateMyProfile } from "./api";
import { registerPeople } from "./people";
import type { Person, ProfileInput, User } from "./types";

/** Max initials taken from a display name (matches the avatar derivation elsewhere). */
const MAX_INITIALS = 2;

/** The current user's cached profile, or `undefined` until {@link loadUsers} resolves. */
let me: User | undefined;
/** Whether the one-time load has completed (success OR graceful failure). */
let loaded = false;
/** The single in-flight load promise, shared by concurrent callers. */
let inFlight: Promise<void> | undefined;

/**
 * Derive up-to-two uppercase initials from a display name.
 *
 * @param name - The person's display name.
 * @returns The initials (e.g. "Ada Lovelace" → "AL"), or "?" when empty.
 * @example
 * ```ts
 * initialsOf("Ada Lovelace"); // "AL"
 * ```
 */
function initialsOf(name: string): string {
  const words = name.split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, MAX_INITIALS).map(word => word.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

/**
 * Resolve a persisted {@link User} to a {@link Person} — derived initials plus the chosen avatar
 * colour token (omitted when the user has no colour, so the avatar falls back).
 *
 * @param user - The persisted user.
 * @returns The `Person` the avatar + choosers render.
 * @example
 * ```ts
 * userToPerson({ id: "u_x", name: "Ada", color: "--label-green", createdAt: 0, updatedAt: 0 });
 * ```
 */
export function userToPerson(user: User): Person {
  const person: Person = { id: user.id, name: user.name, initials: initialsOf(user.name) };
  if (user.color) person.color = user.color;
  return person;
}

/**
 * Load the signed-in user + every persisted user once and register them into `lib/people` (so cards,
 * the rail, and the choosers resolve them). Caches a single in-flight promise; degrades silently to the
 * static cast when unauthenticated/offline. Safe to call from multiple islands.
 *
 * @returns A promise that resolves once the (one-time) load settles.
 * @example
 * ```ts
 * await loadUsers(); // before building the assignee chooser
 * ```
 */
export async function loadUsers(): Promise<void> {
  if (loaded) return;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        me = await getMyProfile();
        registerPeople([userToPerson(me)]);
        const all = await listUsers();
        registerPeople(all.map(person => userToPerson(person)));
      } catch {
        // Unauthenticated or offline — leave the static cast as the only resolvable people.
      }
      loaded = true;
    })();
  }
  return inFlight;
}

/**
 * The current user's cached profile, or `undefined` until {@link loadUsers} has resolved.
 *
 * @returns The current {@link User}, or `undefined`.
 * @example
 * ```ts
 * const profile = currentUser();
 * ```
 */
export function currentUser(): User | undefined {
  return me;
}

/**
 * Persist the signed-in user's profile (name + colour), update the cache, and re-register them so every
 * surface repaints with the new name/colour.
 *
 * @param input - The chosen `{ name, color }`.
 * @returns The persisted {@link User}.
 * @example
 * ```ts
 * await saveProfile({ name: "Ada", color: "--label-green" });
 * ```
 */
export async function saveProfile(input: ProfileInput): Promise<User> {
  const user = await updateMyProfile(input);
  me = user;
  registerPeople([userToPerson(user)]);
  return user;
}
