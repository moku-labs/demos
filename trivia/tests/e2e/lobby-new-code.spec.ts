/**
 * @file Regression test for the "New code" button (Issue 2).
 *
 * Root cause (confirmed): the SPA's Navigation API interceptor catches `location.reload()` because
 * the reloaded URL is identical to the current URL (`pathWithSearch(url) === pathWithSearch(location)`),
 * and converts it to a no-op scroll-to-top — producing "no request, no socket message".
 *
 * Fix: `resetRoom()` now calls `hardNavigate(location.href)` (from `@moku-labs/web/browser`), which
 * detaches the SPA interceptor before navigating so the reload is a genuine full-page load.
 *
 * These tests WOULD HAVE FAILED under the old `location.reload()` because that call was silently
 * swallowed by the Navigation API intercept; they PASS with `hardNavigate`.
 *
 * The two-context flow:
 *  1. TV opens → shows code C1.
 *  2. A phone joins C1 → appears in the TV lobby grid (sanity: C1 is live).
 *  3. TV clicks [data-reset] ("New code").
 *  4. TV performs a real page reload (not a no-op scroll) → lobby returns with a NEW code C2 ≠ C1.
 *  5. A phone navigates to C2 → joins and appears; C1 is no longer reachable (old room gone).
 *
 * The Hub DO warm-up + code-wait are borrowed from 00-two-context-flow.spec.ts.
 */
import { expect, test } from "@playwright/test";
import { joinPhone } from "./live-join";

/** How long to wait for the WebRTC Hub DO to settle a room code. */
const HUB_READY_TIMEOUT = 30_000;
/** How long to wait for the post-reset lobby to show a fresh code. */
const RESET_TIMEOUT = 25_000;
/**
 * How long to wait for a phone to appear in the TV lobby grid. Generous on purpose: a live
 * two-context WebRTC join (hub WS + trystero peer discovery) lands in ~2 s solo but can exceed 25 s
 * near the end of a fully-parallel 6-project suite run — the join either lands or it doesn't, so
 * headroom here adds no false-green risk.
 */
const JOIN_TIMEOUT = 45_000;

/**
 * Extract the lobby room code from the TV page. Returns "" if no real code visible yet.
 *
 * @param page - The TV Playwright page.
 * @returns The room code, or "" if not yet shown.
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
 * @param page - The TV Playwright page.
 * @param timeoutMs - Max wait in milliseconds.
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
    await page.waitForTimeout(800);
  }
  throw new Error("Room code not available — Hub DO may not be accessible");
}

/**
 * Warm up the Hub Durable Object by navigating to / and waiting for a real code.
 *
 * @param browser - The Playwright browser.
 */
async function warmUpHubDO(browser: import("@playwright/test").Browser): Promise<void> {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    // Wait for a real room code (Hub DO allocated a room)
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const code = await getRoomCode(page);
      if (code) break;
      await page.waitForTimeout(1000);
    }
    // Wait for the reconnect strip to clear (Hub WS may drop once then recover)
    for (let i = 0; i < 20; i++) {
      const strip = page.locator("[data-component='reconnect-strip']");
      if (!(await strip.isVisible({ timeout: 300 }).catch(() => false))) {
        await page.waitForTimeout(500);
        if (!(await strip.isVisible({ timeout: 300 }).catch(() => false))) break;
      }
      await page.waitForTimeout(1000);
    }
  } finally {
    await ctx.close();
  }
}

/**
 * Click a control that triggers a full-page reload and wait until a FRESH document has replaced the
 * current one — proving a real navigation happened even though the URL stays identical. A sentinel is
 * stamped on `window` before the click; a genuine reload discards it. Under the original bug the SPA's
 * Navigation interceptor swallowed the same-URL `location.reload()`, so the sentinel SURVIVED and this
 * (correctly) fails — the regression guard for the `hardNavigate` fix.
 *
 * @param page - The TV Playwright page.
 * @param locator - The control to click (the lobby "New code" button).
 */
async function clickAndAwaitReload(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator
): Promise<void> {
  await page.evaluate(() => {
    (globalThis as unknown as { __preReset?: boolean }).__preReset = true;
  });
  await locator.click();
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (globalThis as unknown as { __preReset?: boolean }).__preReset ?? false)
          .catch(() => false),
      {
        timeout: RESET_TIMEOUT,
        message: "New code must trigger a real full-page reload (a fresh document)"
      }
    )
    .toBe(false);
  await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
}

test.describe("lobby New-code button (Issue 2 regression)", () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    await warmUpHubDO(browser);
  });

  test("clicking New code performs a real reload + shows a DIFFERENT code (regression: was a SPA no-op)", async ({
    browser
  }) => {
    const tvCtx = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" });
    const tvPage = await tvCtx.newPage();

    try {
      // ── Step 1: TV boots, get code C1 ─────────────────────────────────────────
      await tvPage.goto("/");
      await tvPage.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      let codeC1: string;
      try {
        codeC1 = await waitForCode(tvPage, HUB_READY_TIMEOUT);
      } catch {
        test.skip(true, "Room code not available — Hub DO may not be accessible");
        return;
      }

      // Wait for Hub WS to stabilise (reconnect strip cleared)
      const reconnectStrip = tvPage.locator("[data-component='reconnect-strip']");
      const isReconnecting = await reconnectStrip.isVisible({ timeout: 500 }).catch(() => false);
      if (isReconnecting) {
        try {
          await expect(reconnectStrip).not.toBeVisible({ timeout: 30_000 });
        } catch {
          test.skip(true, "Hub WS reconnect timed out");
          return;
        }
      }

      // ── Step 2: assert the [data-reset] button is present and hittable ────────
      const resetBtn = tvPage.locator("[data-reset]");
      await expect(resetBtn).toBeVisible({ timeout: 5_000 });
      await expect(resetBtn).toBeEnabled();

      // ── Step 3: click New code — assert a REAL reload occurs ──────────────────
      // Under the old bug the SPA Navigation interceptor swallowed the same-URL reload (no fresh
      // document); `hardNavigate` forces a genuine full-page load. The helper proves it via a sentinel.
      await clickAndAwaitReload(tvPage, resetBtn);

      // ── Step 4: assert code C2 ≠ C1 ──────────────────────────────────────────
      let codeC2: string;
      try {
        codeC2 = await waitForCode(tvPage, RESET_TIMEOUT);
      } catch {
        throw new Error(
          "No room code appeared after New code click — the reload may not have occurred"
        );
      }

      expect(
        codeC2,
        `New code must differ from the old code. Old: ${codeC1} — New: ${codeC2}. ` +
          "Under the bug (SPA intercepts reload → no-op scroll), the same code is re-displayed."
      ).not.toBe(codeC1);

      // ── Step 5: assert the QR block has the SVG element (crisp QR) ───────────
      // After the fresh boot, the QR matrix arrives from the room stage; the SVG
      // should be rendered once the descriptor is ready. Allow up to 10 s for it.
      const qrSvg = tvPage.locator("[data-qr-svg]");
      await expect(qrSvg, "QR SVG should render after a fresh room opens").toBeVisible({
        timeout: 10_000
      });
    } finally {
      await tvCtx.close();
    }
  });

  test("after New code, a phone can join the NEW room (C2) and appears in the lobby grid", async ({
    browser
  }) => {
    const tvCtx = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" });
    const phoneCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    const tvPage = await tvCtx.newPage();
    const phonePage = await phoneCtx.newPage();

    try {
      // ── Boot TV, get C1 ───────────────────────────────────────────────────────
      await tvPage.goto("/");
      await tvPage.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      let codeC1: string;
      try {
        codeC1 = await waitForCode(tvPage, HUB_READY_TIMEOUT);
      } catch {
        test.skip(true, "Room code not available");
        return;
      }

      const reconnectStrip = tvPage.locator("[data-component='reconnect-strip']");
      const isReconnecting = await reconnectStrip.isVisible({ timeout: 500 }).catch(() => false);
      if (isReconnecting) {
        try {
          await expect(reconnectStrip).not.toBeVisible({ timeout: 30_000 });
        } catch {
          test.skip(true, "Hub WS reconnect timed out");
          return;
        }
      }

      // ── Phone joins C1 (sanity: C1 is live; recovery-aware — see ./live-join) ──
      await joinPhone(phonePage, codeC1, "PlayerA", { connectTimeout: JOIN_TIMEOUT });

      await tvPage.waitForSelector(
        "[data-player-grid] [data-component='player-tile']:not([data-empty])",
        { timeout: JOIN_TIMEOUT }
      );

      // ── Click New code on TV → real reload → C2 ──────────────────────────────
      const resetBtn = tvPage.locator("[data-reset]");
      await expect(resetBtn).toBeVisible({ timeout: 5_000 });
      await clickAndAwaitReload(tvPage, resetBtn);
      let codeC2: string;
      try {
        codeC2 = await waitForCode(tvPage, RESET_TIMEOUT);
      } catch {
        throw new Error("No code after New code click");
      }

      expect(codeC2).not.toBe(codeC1);

      // ── Wait for Hub WS on the new room to stabilise ──────────────────────────
      const newReconnect = tvPage.locator("[data-component='reconnect-strip']");
      const reconnecting2 = await newReconnect.isVisible({ timeout: 500 }).catch(() => false);
      if (reconnecting2) {
        await expect(newReconnect)
          .not.toBeVisible({ timeout: 30_000 })
          .catch(() => {});
      }

      // ── A new phone joins C2 ──────────────────────────────────────────────────
      const phone2Ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "dark"
      });
      const phone2Page = await phone2Ctx.newPage();
      try {
        // Recovery-aware join (see ./live-join) — this was the suite's most frequent flake site.
        await joinPhone(phone2Page, codeC2, "PlayerB", { connectTimeout: JOIN_TIMEOUT });

        // TV (now on C2) should see PlayerB appear in the grid
        await tvPage.waitForSelector(
          "[data-player-grid] [data-component='player-tile']:not([data-empty])",
          { timeout: JOIN_TIMEOUT }
        );

        const tiles = tvPage.locator(
          "[data-player-grid] [data-component='player-tile']:not([data-empty])"
        );
        // Only PlayerB — PlayerA was on C1 (old room) which is now gone
        await expect(tiles).toHaveCount(1, { timeout: 10_000 });
      } finally {
        await phone2Ctx.close();
      }
    } finally {
      await tvCtx.close();
      await phoneCtx.close();
    }
  });
});
