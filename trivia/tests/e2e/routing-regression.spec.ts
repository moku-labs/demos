/**
 * @file Routing regression — the `/code/{code}` deep-link, the `/code` join-by-code box, and the TV root.
 *
 * ## Routing scheme (2026-06-28)
 * The phone surface lives at `/code/{code}` (short, easy to read aloud, type, and share); the TV lobby
 * QR encodes that `${origin}/code/{code}` URL directly (built app-side in `lib/room`, not room's
 * `?room=CODE` form). A phone that opens the bare `/code` (no code) gets a join-by-code box that
 * uppercases the typed code and navigates to `/code/{code}`.
 *
 * ## What these tests assert
 * 1. `/code/CODE` boots the **phone controller** (join wizard, phase=join) — NOT the TV stage.
 * 2. `/code` (no code) shows the join box; submitting a (lower-case) code navigates to `/code/CODE`.
 * 3. A normal `/` load boots the TV lobby (no regression).
 * 4. The removed `?room=` redirect is gone: `/?room=CODE` now just boots the TV (no phone hijack).
 */
import { expect, test } from "@playwright/test";

// 8-char code matching TRIVIA.codeLength from src/config.ts (room's confusable-free alphabet).
const ROOM_CODE = "ABC23456";

// ─── /code/{code} deep-link boots the phone controller ───────────────────────

test.describe("Phone deep-link — /code/{code} boots the controller", () => {
  test("/code/CODE boots the controller in the join wizard (not the TV)", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", e => jsErrors.push(e.message));

    await page.goto(`/code/${ROOM_CODE}`);
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });

    const finalPath = new URL(page.url()).pathname;
    expect(finalPath, "/code/CODE must stay at /code/CODE (no redirect)").toBe(
      `/code/${ROOM_CODE}`
    );

    await expect(
      page.locator("[data-controller]"),
      "Controller island must mount on a /code/ deep-link"
    ).toHaveAttribute("data-phase", "join");

    // The TV stage island must NOT mount (no second-TV boot).
    expect(
      await page.locator("[data-island='stage']").count(),
      "TV stage island must NOT mount on a phone deep-link"
    ).toBe(0);

    expect(
      jsErrors.filter(e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")),
      `JS errors during /code/ boot: ${jsErrors.join(", ")}`
    ).toHaveLength(0);
  });

  test("a lower-case /code/code deep-link is normalized to the same room", async ({ page }) => {
    await page.goto(`/code/${ROOM_CODE.toLowerCase()}`);
    await page.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });

    // The wizard's confirmation/room copy reads the uppercased code (room codes are uppercase).
    await expect(
      page.locator("[data-component='join-wizard']"),
      "Join wizard must render for a lower-case /code/ deep-link"
    ).toBeVisible();
  });
});

// ─── /code (no code) — the join-by-code box ──────────────────────────────────

test.describe("Join-by-code box — /code (no code in the URL)", () => {
  test("/code shows the code-entry box (not a crash, not the TV)", async ({ page }) => {
    await page.goto("/code");
    await page.waitForSelector("[data-component='code-entry']", { timeout: 20_000 });

    await expect(page.locator("[data-code-input]")).toBeVisible();
    expect(
      await page.locator("[data-island='stage']").count(),
      "TV stage island must NOT mount on /code"
    ).toBe(0);
  });

  test("typing a lower-case code uppercases it and Join navigates to /code/CODE", async ({
    page
  }) => {
    await page.goto("/code");
    const input = page.locator("[data-code-input]");
    await input.waitFor({ timeout: 20_000 });

    // Type lower-case with a stray space/symbol; the field normalizes to the uppercase code alphabet.
    await input.fill("");
    await input.pressSequentially("ab2-3 45x");
    await expect(input, "the code field auto-uppercases + strips to A–Z/0–9").toHaveValue(
      "AB2345X"
    );

    await page.locator("[data-component='code-entry'] [data-component='clay-button']").click();

    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    expect(new URL(page.url()).pathname, "Join navigates to the uppercased /code/CODE").toBe(
      "/code/AB2345X"
    );
  });
});

// ─── Guard: the TV root + the removed ?room= redirect ────────────────────────

test.describe("TV root — / boots the stage (and ?room= no longer hijacks it)", () => {
  test("/ boots the TV stage lobby", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-island='stage']", { timeout: 20_000 });

    expect(new URL(page.url()).pathname, "/ must stay at / (no spurious redirect)").toBe("/");
    await expect(
      page.locator("[data-stage][data-phase='lobby']"),
      "Stage must be in lobby phase on /"
    ).toBeVisible();
    expect(
      await page.locator("[data-controller]").count(),
      "Controller island must NOT mount on plain /"
    ).toBe(0);
  });

  test("/?room=CODE no longer redirects — it just boots the TV (legacy redirect removed)", async ({
    page
  }) => {
    await page.goto(`/?room=${ROOM_CODE}`);
    await page.waitForSelector("[data-island='stage']", { timeout: 20_000 });

    // The old behavior rewrote this to the controller; the redirect is gone, so it stays on / as a TV.
    expect(
      new URL(page.url()).pathname,
      "?room= must no longer rewrite the URL (the redirect was removed)"
    ).toBe("/");
    expect(
      await page.locator("[data-controller]").count(),
      "?room= must NOT boot a phone controller anymore"
    ).toBe(0);
  });
});
