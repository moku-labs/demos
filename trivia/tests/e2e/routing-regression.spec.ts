/**
 * @file Routing regression — QR join URL normalization + controller deep-link fidelity.
 *
 * ## Bug fixed (2026-06-27)
 * `@moku-labs/room` hardcodes the phone join URL as `${origin}/?room=CODE` (room's
 * `buildJoinUrl`), matching the app's `/` = TV/stage route. Scanning the QR booted a
 * second TV instead of the phone controller.
 *
 * ## Fix (src/spa.tsx + tests/e2e/harness/spa-e2e.ts)
 * Before `app.start()`, if `?room=CODE` is present and `location.pathname === "/"`,
 * `history.replaceState` rewrites to `/controller/{code}` — so the scanned deep-link
 * boots the phone controller, not the TV.
 *
 * ## What these tests assert
 * 1. `/?room=CODE` normalizes to `/controller/CODE` (URL redirect).
 * 2. The **phone controller** surface mounts (join wizard, phase=join) — NOT the TV stage.
 * 3. A normal `/` load (no `?room=`) still boots the TV lobby (no regression).
 * 4. A direct `/controller/CODE` deep-link still boots the controller (no regression).
 */
import { expect, test } from "@playwright/test";

// 8-char code matching TRIVIA.codeLength from src/config.ts
const ROOM_CODE = "ABC12345";

// ─── Finding: ?room= QR join URL routes to TV instead of controller ──────────
// Oracle: Invariant / FEW HICCUPPS purpose oracle — the QR code displayed on
// the TV must route the scanned device to the PHONE controller, not a second TV.
// Evidence: room's buildJoinUrl emits `${origin}/?room=CODE` which matched `/` = TV.
// After fix: `/?room=CODE` triggers replaceState → `/controller/CODE` before SPA boots.

test.describe("QR join URL normalization — ?room= routes to /controller/ (regression)", () => {
  test("/?room=CODE normalizes URL to /controller/CODE before mount", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", e => jsErrors.push(e.message));

    await page.goto(`/?room=${ROOM_CODE}`);

    // The SPA must rewrite the URL to /controller/CODE before mounting the island.
    // We wait for the controller to hydrate (proves it booted the PHONE surface, not TV).
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });

    // 1. URL is now /controller/{code}
    const finalPath = new URL(page.url()).pathname;
    expect(
      finalPath,
      `URL must normalize from /?room=${ROOM_CODE} to /controller/${ROOM_CODE}; got ${finalPath}`
    ).toBe(`/controller/${ROOM_CODE}`);

    // 2. The phone controller surface mounted (join wizard, not TV lobby)
    await expect(
      page.locator("[data-controller]"),
      "Controller island must be visible (phone surface, not TV stage)"
    ).toBeVisible();

    // 3. The controller is in join phase (wizard) — not some crash state
    await expect(
      page.locator("[data-controller]"),
      "Controller must be in join phase (wizard) after QR-link boot"
    ).toHaveAttribute("data-phase", "join");

    // 4. The TV stage island must NOT have mounted (no second-TV boot)
    const stageCount = await page.locator("[data-island='stage']").count();
    expect(
      stageCount,
      "TV stage island must NOT mount when a ?room= scan routes to the controller"
    ).toBe(0);

    // 5. No JS errors during the redirect + boot
    expect(
      jsErrors.filter(e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")),
      `JS errors during QR join boot: ${jsErrors.join(", ")}`
    ).toHaveLength(0);
  });

  test("/?room=CODE join wizard renders the name/avatar/colour flow", async ({ page }) => {
    await page.goto(`/?room=${ROOM_CODE}`);
    await page.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);

    // The join wizard component must be present (not an empty/crash shell)
    await expect(
      page.locator("[data-component='join-wizard']"),
      "Join wizard must render inside the controller after ?room= redirect"
    ).toBeVisible();

    // Step 1 (name entry) should be the initial visible step
    await expect(
      page.locator("[data-step='name']"),
      "Name step must be the first visible wizard step"
    ).toBeVisible();
  });

  // ─── Guard: normal / still boots TV lobby (no regression) ───────────────────

  test("/ (no ?room=) still boots the TV stage lobby", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-island='stage']", { timeout: 20_000 });

    // Must be on / with no redirect
    const finalPath = new URL(page.url()).pathname;
    expect(finalPath, "/ must stay at / (no spurious redirect)").toBe("/");

    // TV stage must mount in lobby phase
    await expect(
      page.locator("[data-island='stage']"),
      "Stage island must mount on /"
    ).toBeVisible();
    await expect(
      page.locator("[data-stage][data-phase='lobby']"),
      "Stage must be in lobby phase on /"
    ).toBeVisible();

    // Phone controller must NOT mount on /
    const controllerCount = await page.locator("[data-controller]").count();
    expect(controllerCount, "Controller island must NOT mount on plain /").toBe(0);
  });

  // ─── Guard: direct /controller/{code} still boots the controller ─────────────

  test("/controller/CODE direct deep-link still boots the controller", async ({ page }) => {
    await page.goto(`/controller/${ROOM_CODE}`);
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });

    const finalPath = new URL(page.url()).pathname;
    expect(finalPath, "/controller/CODE must stay at /controller/CODE (no spurious redirect)").toBe(
      `/controller/${ROOM_CODE}`
    );

    await expect(
      page.locator("[data-controller]"),
      "Controller island must mount on direct /controller/ deep-link"
    ).toBeVisible();

    await expect(
      page.locator("[data-controller]"),
      "Direct deep-link must boot controller in join phase"
    ).toHaveAttribute("data-phase", "join");
  });
});
