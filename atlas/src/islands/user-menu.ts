/**
 * @file user-menu island (overlay D2 trigger) — the masthead avatar button. Mounts on the persistent
 * `[data-island="user-menu"]` button (design context §6 B1/D2), probes the session, and renders the
 * signed-in person's initials {@link Avatar} into the button. Clicking it opens the user variant of the
 * universal menu via the menu bus; choosing "Sign out" clears the session and returns to the sign-in
 * route. The display email is read from the `atlas:user` localStorage record the auth island writes.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { Avatar } from "../components/Avatar";
import { getSession, signOut } from "../lib/api";
import { openMenu } from "../lib/menu";
import { navigate } from "../lib/nav";
import type { Person } from "../lib/types";
import { urls } from "../routes";

/** Per-instance state for the user-menu island — the signed-in person + their email. */
type UserState = {
  /** The signed-in person (for the avatar), or `null` until the session resolves. */
  person: Person | null;
  /** The signed-in email (from the `atlas:user` record), or empty when unknown. */
  email: string;
};

/** The user-menu component context (typed per-instance state). */
type UserContext = Spa.IslandContext<UserState>;

/** The localStorage key the auth island persists `{ name, email }` under. */
const USER_KEY = "atlas:user";

/** Max initials taken from a display name. */
const MAX_INITIALS = 2;

/**
 * Build the initial (signed-out) user state.
 *
 * @returns The initial state with no person resolved.
 * @example
 * ```ts
 * createIsland("user-menu", { state: initState });
 * ```
 */
function initState(): UserState {
  // eslint-disable-next-line unicorn/no-null -- null is the signed-out person domain contract
  return { person: null, email: "" };
}

/**
 * Render the avatar from state, or nothing until the session resolves.
 *
 * @param state - The current user state.
 * @returns The avatar view, or an empty fragment when signed out.
 * @example
 * ```ts
 * createIsland("user-menu", { render });
 * ```
 */
function render(state: Readonly<UserState>): Spa.RenderResult {
  const { person } = state;
  if (!person) return h(Fragment, {});

  return h(Avatar, { person, size: "sm" });
}

/**
 * Derive up-to-two uppercase initials from a display name.
 *
 * @param name - The person's display name.
 * @returns The initials (e.g. "Ada Lovelace" -> "AL").
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
 * Read the persisted `{ name, email }` record the auth island writes, or `null` when absent/invalid.
 *
 * @returns The stored user record, or `null`.
 * @example
 * ```ts
 * const stored = readStoredUser();
 * ```
 */
function readStoredUser(): { name: string; email: string } | null {
  const raw = localStorage.getItem(USER_KEY);
  // eslint-disable-next-line unicorn/no-null -- null is the absent/invalid stored-user domain contract
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: unknown; email?: unknown };
    const name = typeof parsed.name === "string" ? parsed.name : "";
    const email = typeof parsed.email === "string" ? parsed.email : "";
    return { name, email };
  } catch {
    // eslint-disable-next-line unicorn/no-null -- null is the absent/invalid stored-user domain contract
    return null;
  }
}

/**
 * Probe the session and seed the avatar + email. Builds a {@link Person} from the session actor; the
 * email comes from the persisted `atlas:user` record (empty when the user has not signed in via the
 * form this session).
 *
 * @param ctx - The user-menu component context.
 * @returns A promise that resolves once the session is resolved into state.
 * @example
 * ```ts
 * createIsland("user-menu", { onMount: mount });
 * ```
 */
async function mount(ctx: UserContext): Promise<void> {
  const actor = await getSession();
  if (!actor) return;

  const person: Person = { id: actor.id, name: actor.name, initials: initialsOf(actor.name) };
  const email = readStoredUser()?.email ?? "";
  ctx.set({ person, email });
}

/**
 * Open the user menu anchored to the avatar button; "Sign out" clears the session and returns to
 * sign-in.
 *
 * @param ctx - The user-menu component context.
 * @example
 * ```ts
 * events: { click: onClick };
 * ```
 */
function onClick(ctx: UserContext): void {
  const { person, email } = ctx.state;
  const name = person?.name ?? "Signed in";

  openMenu({
    variant: "user",
    anchor: ctx.el as HTMLElement,
    user: { name, email },
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline handler for the universal-menu actions
    onAction: action => {
      if (action === "sign-out")
        signOut().then(
          () => navigate(urls.toUrl("signin", {})),
          () => {}
        );
    }
  });
}

/** Masthead chrome island: the avatar button + its user menu. */
export const userMenu = createIsland<UserState>("user-menu", {
  state: initState,
  render,
  onMount: mount,
  events: { click: onClick }
});
