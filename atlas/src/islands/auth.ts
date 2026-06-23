/**
 * @file auth island (A1/A2) — intercepts the sign-in / sign-up form so it posts to `/api/auth/*` via
 * the REST client instead of a full-page POST (design context §6 A1/A2). Mounts on the persistent
 * `[data-island="auth"]` form whose `data-mode` selects sign-in vs sign-up. On success it records the
 * display name + email in the `atlas:user` localStorage record (read by the `user-menu` island) and
 * navigates home; on failure it reveals the form's `[data-auth-error]` line. The social buttons run a
 * one-tap demo sign-in. Stateless (events only) — the SSR form supplies all markup and degrades to a
 * real POST with no JS. NOTE: the `toast` island lives in SiteLayout, not the auth page, so this
 * island never relies on `showToast`.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { signIn, signUp } from "../lib/api";
import { hardNavigate } from "../lib/hard-nav";
import { urls } from "../routes";

/** The stateless auth context (its `el` is the auth form; per-instance state is unused). */
type AuthContext = Spa.IslandContext<object>;

/** The localStorage key the signed-in `{ name, email }` persists under (read by `user-menu`). */
const USER_KEY = "atlas:user";

/** The demo identity behind the social ("continue with") buttons. */
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- intentionally literal demo credential, not a real secret
const DEMO_CREDS = { email: "demo@atlas.dev", password: "demo-password" } as const;

/**
 * Read a named field's trimmed value from the auth form.
 *
 * @param form - The auth form element.
 * @param name - The input's `name` attribute.
 * @returns The trimmed value, or empty string when the field is absent.
 * @example
 * ```ts
 * const email = fieldValue(form, "email");
 * ```
 */
function fieldValue(form: Element, name: string): string {
  return form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value.trim() ?? "";
}

/**
 * Reveal the form's inline error line with a message.
 *
 * @param form - The auth form element.
 * @param message - The error text to show.
 * @example
 * ```ts
 * showError(form, "Passwords do not match.");
 * ```
 */
function showError(form: Element, message: string): void {
  const line = form.querySelector<HTMLElement>("[data-auth-error]");
  if (!line) return;

  line.textContent = message;
  line.toggleAttribute("hidden", false);
}

/**
 * Persist the signed-in `{ name, email }` record and navigate to the home board.
 *
 * Crossing from the auth split to the app chrome is a layout-boundary change the SPA cannot swap
 * in place, so this is a real full-page load ({@link hardNavigate}) — the home board then renders
 * against a fresh, authenticated document.
 *
 * @param name - The display name.
 * @param email - The email address.
 * @example
 * ```ts
 * finishAuth("Ada Lovelace", "ada@atlas.dev");
 * ```
 */
function finishAuth(name: string, email: string): void {
  localStorage.setItem(USER_KEY, JSON.stringify({ name, email }));
  hardNavigate(urls.toUrl("home", {}));
}

/**
 * Intercept the form submit: validate (sign-up confirm) and call the matching auth endpoint, then
 * persist + navigate on success or reveal the error line on failure.
 *
 * @param _ctx - The auth component context (unused — the form is read from `form`).
 * @param event - The delegated submit event (default-prevented — never a full-page POST).
 * @param form - The matched auth form (its `data-mode` selects sign-in vs sign-up).
 * @returns A promise that resolves once auth settles.
 * @example
 * ```ts
 * events: { submit: onSubmit };
 * ```
 */
async function onSubmit(_ctx: AuthContext, event: Event, form: Element): Promise<void> {
  event.preventDefault();

  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the mode comparison handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const mode = form.getAttribute("data-mode");
  const email = fieldValue(form, "email");
  const password = fieldValue(form, "password");

  // Sign-up requires a name and a matching confirmation.
  if (mode === "signup") {
    const name = fieldValue(form, "name");
    if (password !== fieldValue(form, "confirm")) {
      showError(form, "Passwords do not match.");
      return;
    }

    try {
      const session = await signUp({ email, password, ...(name ? { name } : {}) });
      finishAuth(session.name, session.email);
    } catch {
      showError(form, "Could not create your account. Please try again.");
    }
    return;
  }

  // Sign-in.
  try {
    const session = await signIn({ email, password });
    finishAuth(session.name, session.email);
  } catch {
    showError(form, "Those details did not match. Please try again.");
  }
}

/**
 * Run a one-tap demo sign-in for the social ("continue with") buttons, then navigate home.
 * These are demo buttons — they sign in with the built-in demo credentials (no real OAuth flow).
 *
 * @param ctx - The auth component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-social]` button.
 * @returns A promise that resolves once the demo session settles.
 * @example
 * ```ts
 * events: { "click [data-social]": onSocial };
 * ```
 */
async function onSocial(ctx: AuthContext, _event: Event, button: Element): Promise<void> {
  const socialButton = button as HTMLButtonElement;
  socialButton.disabled = true;
  socialButton.setAttribute("aria-busy", "true");

  try {
    const session = await signIn(DEMO_CREDS);
    finishAuth(session.name, session.email);
  } catch {
    socialButton.disabled = false;
    socialButton.removeAttribute("aria-busy");
    showError(
      ctx.el,
      "Demo sign-in: tap the email form above with demo@atlas.dev and any password."
    );
  }
}

/** Auth-page chrome island: intercepts the sign-in / sign-up form + the demo social buttons. */
export const auth = createIsland("auth", {
  events: {
    submit: onSubmit,
    "click [data-social]": onSocial
  }
});
