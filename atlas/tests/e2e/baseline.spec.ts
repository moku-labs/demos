/**
 * @file Visual baseline — `toHaveScreenshot` for every screen × desktop + mobile.
 *
 * Covers: A1 Sign-in · A2 Sign-up · A3 Board view · A4 List view · A5 Issue page · A3+C1 Activity
 * drawer open · B1 Masthead · B2 Departments index · B3 Boards bar · B4 Board header · B5 Footer.
 *
 * Every screenshot:
 *   - Clock frozen to 2026-06-22T12:00:00Z (seed dates are early–mid 2026 → deterministic relative times)
 *   - `document.fonts.ready` awaited (self-hosted Fraunces/Hanken Grotesk/Spline Sans Mono)
 *   - Animations disabled, caret hidden, CSS scale, maxDiffPixelRatio 0.02 (in playwright.config.ts)
 *   - Fixed colorScheme "light", deviceScaleFactor 1 (in playwright.config.ts)
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, prepareScreenshot, signIn } from "./_auth";

test.describe("Auth screens — visual baselines", () => {
  test("A1 Sign-in page", async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto("/signin");
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("signin-desktop.png", { fullPage: true });
  });

  test("A2 Sign-up page", async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto("/signup");
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("signup-desktop.png", { fullPage: true });
  });
});

test.describe("App screens — visual baselines (signed in)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("A3 Board view (Platform board)", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // Wait for columns to be visible (board island rendered)
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("board-platform-desktop.png", { fullPage: true });
  });

  test("A4 List view (Platform board)", async ({ page }) => {
    await page.goto("/board/board-platform/list");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-listview]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("list-platform-desktop.png", { fullPage: true });
  });

  test("A5 Issue page (issue-ws-reconnect)", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("issue-ws-reconnect-desktop.png", { fullPage: true });
  });

  test("C1 Activity log drawer open", async ({ page }) => {
    await page.goto("/board/board-platform/activity");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-activity-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("activity-drawer-desktop.png", { fullPage: true });
  });

  test("B5 Footer visible", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    // Scroll to footer
    await page.locator("[data-footer]").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("[data-footer]")).toHaveScreenshot("footer.png");
  });

  test("B1 Masthead region", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-masthead]")).toHaveScreenshot("masthead.png");
  });

  test("B2 Departments index region", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-departments]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-departments]")).toHaveScreenshot("departments-index.png");
  });

  test("B3 Boards bar region", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-boards-bar]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-boards-bar]")).toHaveScreenshot("boards-bar.png");
  });

  test("B4 Board header region", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-board-header]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-board-header]")).toHaveScreenshot("board-header.png");
  });

  test("G Card component (close-up)", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // The "Fix flaky WebSocket reconnect" card has labels, assignees, sub-issues — richest card
    await expect(page.locator("[data-card-id='issue-ws-reconnect']")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-card-id='issue-ws-reconnect']")).toHaveScreenshot(
      "card-rich.png"
    );
  });

  test("Home / (default board)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true });
  });
});

test.describe("Dark theme — visual baseline", () => {
  test.use({ colorScheme: "dark" });

  test("A3 Board view — dark theme", async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    // Toggle to dark theme via the theme-toggle island
    const themeToggle = page.locator("[data-island='theme-toggle'], [data-tool='theme']");
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300); // allow theme transition
    }
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("board-platform-dark-desktop.png", { fullPage: true });
  });
});
