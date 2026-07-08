/**
 * @file Live-room regression for internet-play ICE provisioning (Phase 1 — `src/lib/ice/`).
 *
 * Human-QA finding (Saboteur tour — slow/dead network on the ICE mint endpoint): `bootController`
 * (`src/lib/room/index.ts`) `await`s `fetchIceServers()` — a same-origin `/api/ice` fetch bounded by
 * `ICE_FETCH_TIMEOUT_MS` (2 s) — BEFORE creating the controller app / calling `joinRoom`. Until that
 * resolves, `role`/`controllerApp` are unset, so `intent()` (`src/lib/room/index.ts`) silently no-ops.
 *
 * The join wizard, however, is interactive from the very first paint (`ctx.set({ code })` fires
 * synchronously in `startControllerIsland`, before any await) — so a player who completes the
 * wizard fast (a saved/one-tap profile, or simply a quick typer) CAN submit "Join" while the ICE
 * fetch is still in flight. When `/api/ice` is slow or unreachable (a cold Cloudflare TURN mint, a
 * flaky mobile network — exactly the internet-play scenario this feature targets), that submit is
 * dropped, and the phone is stranded on the (honest, non-misleading) "Joining…" card until the
 * pre-existing `armJoinSelfHeal` watchdog (`src/islands/controller/lifecycle.ts`) re-sends
 * `join-profile` — which, because the watchdog itself only arms AFTER `startController` resolves,
 * now takes materially longer than before this feature existed (confirmed empirically: ~12 s under a
 * permanently-hung `/api/ice`, vs. <1 s with a healthy one — see the QA session evidence).
 *
 * This is NOT a silent-failure bug (the self-heal recovers, and the UI never shows a false "You're
 * in!") — it is a real widening of a pre-existing race, worth pinning so a future regression (the
 * self-heal breaking, or the fail-open timeout growing unbounded) is caught in a REAL two-context
 * WebRTC room, not just the unit-level fetch mocks in `tests/unit/ice-client.test.ts`.
 */
import { expect, test } from "@playwright/test";

/** Generous bound on Hub DO warm-up. */
const HUB_READY_TIMEOUT = 30_000;
/**
 * Bound on the self-heal recovery under a PERMANENTLY hung `/api/ice`: 2 s (ICE fetch timeout) +
 * ~10 s (2 watchdog ticks at `JOIN_HEAL_INTERVAL_MS`=5 s) + slack for CI/cold-start jitter. If this
 * regresses to "never recovers", the app has a real stuck-join bug; if it drops well below ~10 s, the
 * boot sequencing was fixed (parallelized) — a welcome change the assertion tolerates (it only pins
 * an UPPER bound).
 */
const SELF_HEAL_TIMEOUT = 25_000;

/**
 * Read the TV lobby's room code, or "" while still pending/placeholder.
 *
 * @param page - The TV page.
 * @returns The room code, or "" if not yet real.
 */
async function getRoomCode(page: import("@playwright/test").Page): Promise<string> {
  const el = page.locator("[data-code]").first();
  if (!(await el.count())) return "";
  const text = (await el.textContent()) ?? "";
  return text.trim().length >= 6 && text.trim() !== "····" ? text.trim() : "";
}

/**
 * Poll until a real room code appears in the TV lobby.
 *
 * @param page - The TV page.
 * @param timeoutMs - Max wait in ms.
 * @returns The room code.
 * @throws {Error} If no real code appears within the timeout.
 */
async function waitForCode(
  page: import("@playwright/test").Page,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const code = await getRoomCode(page);
    if (code) return code;
    await page.waitForTimeout(500);
  }
  throw new Error("Room code not available — Hub DO may not be accessible");
}

test.describe("ICE provisioning — live join under a stalled /api/ice (Saboteur tour)", () => {
  test.setTimeout(90_000);

  test(
    "a fast join submitted while /api/ice is permanently hung still lands the player " +
      "(fail-open + join self-heal hold together end-to-end)",
    async ({ browser }) => {
      const tvContext = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" });
      const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        reducedMotion: "reduce"
      });

      const tvPage = await tvContext.newPage();
      const phonePage = await phoneContext.newPage();
      const phoneErrors: string[] = [];
      phonePage.on("pageerror", err => phoneErrors.push(err.message));
      phonePage.on("console", msg => {
        if (msg.type() === "error") phoneErrors.push(msg.text());
      });

      try {
        await tvPage.goto("/");
        let roomCode: string;
        try {
          roomCode = await waitForCode(tvPage, HUB_READY_TIMEOUT);
        } catch {
          test.skip(true, "Room code not available — Hub DO may not be accessible");
          return;
        }

        // The phone's OWN /api/ice never resolves — the mint endpoint is cold/unreachable, the
        // realistic internet-play failure mode this feature is meant to fail open around.
        await phonePage.route("**/api/ice", () => new Promise(() => {}));

        await phonePage.goto(`/code/${roomCode}`, { waitUntil: "load" });

        // Drive the wizard at script speed (a fast/one-tap join) — well inside the 2s ICE-fetch
        // window that's still pending, deliberately racing the boot.
        const nameInput = phonePage.locator("[data-name-input]");
        await nameInput.waitFor({ timeout: 10_000 });
        await nameInput.fill("RaceQA");
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 }); // step 1 -> 2
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 }); // step 2 -> 3
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 }); // step 3 -> Join

        // The phone must show an HONEST "Joining…" card, never a misleading immediate "You're in!"
        // (this is pre-existing product behaviour this test also guards).
        await expect(
          phonePage.locator("[data-component='join-wizard'][data-submitted='true']")
        ).toBeVisible({ timeout: 5_000 });

        // Self-heal must eventually land the seat on BOTH sides — the TV roster and the phone's own
        // lobby view — within the bounded window, with zero console/page errors throughout.
        await expect(
          tvPage.locator("[data-player-grid] [data-component='player-tile']:not([data-empty])")
        ).toHaveCount(1, { timeout: SELF_HEAL_TIMEOUT });
        await expect(phonePage.locator("[data-controller][data-phase='lobby']")).toBeVisible({
          timeout: SELF_HEAL_TIMEOUT
        });

        expect(
          phoneErrors,
          `Phone console/page errors during the stalled-ICE race join: ${phoneErrors.join(", ")}`
        ).toHaveLength(0);
      } finally {
        await tvContext.close();
        await phoneContext.close();
      }
    }
  );

  test(
    "the SAME fast join lands promptly (well under the self-heal window) when /api/ice is healthy " +
      "— the ICE feature must stay invisible on the happy path",
    async ({ browser }) => {
      const tvContext = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" });
      const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        reducedMotion: "reduce"
      });

      const tvPage = await tvContext.newPage();
      const phonePage = await phoneContext.newPage();

      try {
        await tvPage.goto("/");
        let roomCode: string;
        try {
          roomCode = await waitForCode(tvPage, HUB_READY_TIMEOUT);
        } catch {
          test.skip(true, "Room code not available — Hub DO may not be accessible");
          return;
        }

        const t0 = Date.now();
        await phonePage.goto(`/code/${roomCode}`, { waitUntil: "load" });
        const nameInput = phonePage.locator("[data-name-input]");
        await nameInput.waitFor({ timeout: 10_000 });
        await nameInput.fill("FastQA");
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 });
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 });
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 });

        await expect(phonePage.locator("[data-controller][data-phase='lobby']")).toBeVisible({
          timeout: 10_000
        });
        const elapsed = Date.now() - t0;
        // Generous — local/CI variance — but MUCH tighter than the stalled-ICE self-heal bound above,
        // pinning that a healthy /api/ice does not materially delay a normal join.
        expect(
          elapsed,
          `Healthy-ICE join took ${elapsed} ms — expected well under the self-heal fallback window`
        ).toBeLessThan(10_000);
      } finally {
        await tvContext.close();
        await phoneContext.close();
      }
    }
  );
});
