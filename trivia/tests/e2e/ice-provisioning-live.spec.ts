/**
 * @file Live-room regression for internet-play ICE provisioning (Phase 1 — `src/lib/ice/`).
 *
 * Human-QA finding (Saboteur tour — slow/dead network on the ICE mint endpoint): `bootController`
 * (`src/lib/room/index.ts`) `await`s `fetchIceServers()` — a same-origin `/api/ice` fetch bounded by
 * `ICE_FETCH_TIMEOUT_MS` (2 s) — BEFORE creating the controller app / calling `joinRoom`. The join
 * wizard, however, is interactive from the very first paint (`ctx.set({ code })` fires synchronously
 * in `startControllerIsland`, before any await) — so a player who completes the wizard fast (a
 * saved/one-tap profile, or simply a quick typer) CAN submit "Join" while boot is still in flight.
 *
 * The bridge's contract for that race (`intent()` in `src/lib/room/index.ts`): a pre-boot intent is
 * QUEUED and flushed the moment the join completes — never silently dropped. (Before that fix, the
 * submit was dropped and only the `armJoinSelfHeal` watchdog in
 * `src/islands/controller/lifecycle.ts` recovered it — empirically ~12 s under a permanently-hung
 * `/api/ice`, vs. <1 s with a healthy one.) This spec pins BOTH halves in a REAL two-context WebRTC
 * room (not just the unit-level fetch mocks in `tests/unit/ice-client.test.ts`): the fail-open ICE
 * timeout keeps the join alive, and the intent queue lands it promptly — strictly faster than the
 * watchdog's first re-send, so a regression back to drop-and-heal fails the timing bound.
 */
import { expect, test } from "@playwright/test";

/** Generous bound on Hub DO warm-up. */
const HUB_READY_TIMEOUT = 30_000;
/**
 * Upper bound (from the "Join" tap) on a fast join landing via the bridge's pre-boot intent QUEUE
 * under a PERMANENTLY hung `/api/ice`: ~2 s (ICE fail-open timeout, already partly elapsed by
 * submit time) + WebRTC pairing + CI jitter slack. Deliberately BELOW the join self-heal watchdog's
 * first re-send (which arms only after boot resolves and cannot fire before 2 stranded ticks at
 * `JOIN_HEAL_INTERVAL_MS`=5 s, i.e. ≥ ~12 s after the tap) — so this passing PROVES the queued
 * intent landed the join, not the watchdog. A regression to silent-drop-then-heal blows this bound.
 */
const QUEUED_JOIN_MS = 9_000;
/**
 * Hard "the join never lands" backstop for the locator waits — generous so a genuine failure
 * surfaces as the tight {@link QUEUED_JOIN_MS} elapsed assertion (with real timing in the message),
 * not as an opaque locator timeout.
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
    "a fast join submitted while /api/ice is permanently hung lands promptly via the pre-boot " +
      "intent queue (fail-open + queued flush — no self-heal wait)",
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
        const submittedAt = Date.now();
        await phonePage.locator("button[data-next]").click({ timeout: 10_000 }); // step 3 -> Join

        // The phone must show an HONEST "Joining…" card, never a misleading immediate "You're in!"
        // (this is pre-existing product behaviour this test also guards; with the queue the card
        // shows only for the remainder of the ICE fail-open window, ~1–2 s at script speed).
        await expect(
          phonePage.locator("[data-component='join-wizard'][data-submitted='true']")
        ).toBeVisible({ timeout: 5_000 });

        // The queued submit must land the seat on BOTH sides — the TV roster and the phone's own
        // lobby view — with zero console/page errors throughout. Locator timeouts stay generous
        // (backstop); the tight contract is the elapsed assertion below.
        await expect(
          tvPage.locator("[data-player-grid] [data-component='player-tile']:not([data-empty])")
        ).toHaveCount(1, { timeout: SELF_HEAL_TIMEOUT });
        await expect(phonePage.locator("[data-controller][data-phase='lobby']")).toBeVisible({
          timeout: SELF_HEAL_TIMEOUT
        });

        // The structural pin: the join landed via the pre-boot intent queue (flushed as soon as the
        // fail-open boot completed), strictly faster than the self-heal watchdog's first re-send
        // (≥ ~12 s after the tap). A regression back to silent-drop-then-heal fails here.
        const elapsed = Date.now() - submittedAt;
        expect(
          elapsed,
          `Queued fast join took ${elapsed} ms from the Join tap — expected the pre-boot intent ` +
            "queue to land it well before the join self-heal watchdog's first re-send"
        ).toBeLessThan(QUEUED_JOIN_MS);

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
