/**
 * @file live-join — the shared "join a phone into a live room" step for the real-room e2e specs
 * (00-two-context-flow / 01-full-match / lobby-new-code), with ONE built-in recovery attempt.
 *
 * The signaling/WebRTC handshake can wedge on a long-lived dev workerd (the hub-accumulation flake:
 * a join that never reaches the lobby, while a fresh attempt succeeds). The product now self-heals
 * the post-wizard wedge in-place: a phone stranded on the "You're in!" card (join intent or its
 * answering roster frame lost — at-most-once wire) re-sends `join-profile` from ~5–10 s (idempotent
 * by `playerToken`; the host's `players.rev` ack-beat answers even a byte-identical duplicate with a
 * fresh delta), escalating to the connection banner's Retry (= `hardNavigate` reload) after ~20 s of
 * unanswered re-sends. Most wedges therefore recover inside `joinPhoneOnce`'s lobby wait. The
 * recovery HERE covers what in-place re-sends cannot (a pre-join handshake that never opened, or a
 * replica wedged stale on a missed-baseline sequence gap): re-`goto` the join URL. A fresh document
 * either auto-reclaims the seat via the persisted `playerToken` (straight into the lobby, no wizard)
 * or re-presents the join wizard — `joinPhoneOnce` handles both paths, so the retry is honest app
 * behaviour, not a test-only cheat.
 */
import type { Page } from "@playwright/test";

/** Options for {@link joinPhone}. */
export type JoinPhoneOptions = {
  /**
   * Budget for the wizard→lobby connect wait per attempt (ms). Default 45 000 — a live join lands in
   * ~2 s solo but can exceed 25–30 s at the cold start of a fully-parallel suite run (four workers
   * booting fixture pages while the first live match connects). The join either lands or it doesn't,
   * so headroom here adds no false-green risk.
   */
  connectTimeout?: number;
  /**
   * Avatar emoji to tap on wizard step 2 (e.g. `"🦊"`). Omit to keep the pre-selected default. Used by
   * the full-freedom join test to force two phones onto the SAME avatar and prove a duplicate is allowed.
   */
  avatar?: string;
  /**
   * Colour NAME to tap on wizard step 3 (the `TRIVIA.playerColors` name, e.g. `"amber"`). Omit to keep
   * the default (first unused hue). Used to force two phones onto the SAME colour — a duplicate that
   * must never block a join now that the wizard greys out nothing.
   */
  color?: string;
};

/**
 * Join a phone into the room (3-step wizard: name → avatar → colour → join), retrying the whole
 * attempt once via a fresh document if the first handshake wedges.
 *
 * @param phone - The phone page.
 * @param code - The room code to join.
 * @param name - The player name to enter in the wizard.
 * @param options - Timeouts (see {@link JoinPhoneOptions}).
 */
export async function joinPhone(
  phone: Page,
  code: string,
  name: string,
  options: JoinPhoneOptions = {}
): Promise<void> {
  try {
    await joinPhoneOnce(phone, code, name, options);
  } catch {
    await joinPhoneOnce(phone, code, name, options);
  }
}

/**
 * One join attempt: after `goto`, either the join wizard appears (fresh join → drive it) or — on a
 * recovery re-goto with a persisted token — the phone lands straight in the lobby.
 *
 * @param phone - The phone page.
 * @param code - The room code to join.
 * @param name - The player name to enter in the wizard.
 * @param options - Timeouts (see {@link JoinPhoneOptions}).
 */
async function joinPhoneOnce(
  phone: Page,
  code: string,
  name: string,
  options: JoinPhoneOptions
): Promise<void> {
  await phone.goto(`/code/${code}`);

  // Three legitimate post-goto states, in one wait (never the bare 'join' phase attribute — the
  // wizard's "You're in!" success card ALSO carries it, with no name input):
  //  1. the lobby directly            → a persisted-token rejoin already completed; done.
  //  2. the step-1 name input         → a fresh wizard; drive it. Waiting for the INPUT (not the
  //     wizard shell) matters: under cold-start CPU load the shell renders a beat before the island
  //     hydrates, and a bare `count()` check raced that beat — the fill was skipped, the name-gated
  //     "Next" stayed disabled, and an un-timeboxed click waited out the whole test budget.
  //  3. neither within the window    → mid-rejoin ("You're in!" card, seat acked, sync pending);
  //     fall through to the lobby wait below.
  const lobby = phone.locator("[data-controller][data-phase='lobby']");
  const nameInput = phone.locator("[data-name-input]");
  await nameInput
    .or(lobby)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  if (await lobby.count()) return;

  if (await nameInput.count()) {
    await nameInput.fill(name);
    // Drive the three steps. Each "Next ▸" / "Join Game ▸" click is time-boxed: Playwright's default
    // actionTimeout is UNLIMITED, so a click on a never-enabled button would hang the test instead of
    // failing this attempt into joinPhone's recovery re-goto. Avatar + colour are pre-selected unless
    // options force a specific one (the full-freedom test taps a deliberate duplicate on each phone).
    await phone.locator("button[data-next]").click({ timeout: 15_000 }); // step 1 → 2
    if (options.avatar !== undefined) {
      await phone
        .locator(`button[data-avatar-cell][aria-label="Avatar ${options.avatar}"]`)
        .click({ timeout: 15_000 });
    }
    await phone.locator("button[data-next]").click({ timeout: 15_000 }); // step 2 → 3
    if (options.color !== undefined) {
      await phone
        .locator(`button[data-swatch][aria-label="Colour ${options.color}"]`)
        .click({ timeout: 15_000 });
    }
    await phone.locator("button[data-next]").click({ timeout: 15_000 }); // step 3 → Join
  }

  // Wait for the lobby. Deliberately a plain wait — NOT an in-test Retry-click loop: driving the
  // app's "Connection lost" Retry mid-join adds reload churn (each is a fresh Hub-DO connection),
  // which under the cold-start CPU storm made contention WORSE — an added-churn run doubled the live
  // flakes and added ~3 min. The correct backstop for a genuine connection drop under peak load is
  // Playwright's per-test retry (config `retries: 2`), which reruns the whole match after the fixture
  // storm has drained onto a calm machine. joinPhone's outer catch still does one whole re-goto for a
  // wedged pre-lobby handshake.
  await lobby.waitFor({ timeout: options.connectTimeout ?? 45_000 });
}
