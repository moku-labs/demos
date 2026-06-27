/**
 * @file Controller (phone) rendering tests — verifies the phone surface renders and lays out
 * correctly. The join wizard is the first screen (pre-connection), accessible without a real room.
 * We verify the component structure, CSS loading, and layout for the join flow.
 *
 * The controller island catches join failures gracefully (leaves the wizard up), so navigating to
 * /controller/TESTCODE shows the join wizard without crashing.
 *
 * DOM note: the SPA swaps island content (not the outer data-layout wrapper), so the outer div
 * keeps data-layout="stage" from the SSR shell. The controller island renders [data-controller]
 * once Preact hydrates — that is what we wait for and assert on.
 */
import { expect, test } from "@playwright/test";

// Use a fake code that won't match any real room — the island handles the failure gracefully
const FAKE_CODE = "TESTCODE";

test.describe("Phone controller — join wizard (pre-connection)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/controller/${FAKE_CODE}`);
    // The SPA boots, routes to the controller island, which hydrates and renders [data-controller].
    // We wait for the island to render — this also confirms SPA routing + island hydration worked.
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
  });

  test("controller island mounts with join phase", async ({ page }) => {
    const island = page.locator("[data-island='controller']");
    await expect(island).toBeVisible();
    // Should be in join phase (wizard) since no real room
    const inner = page.locator("[data-controller]");
    await expect(inner).toBeVisible();
  });

  test("join wizard renders the join screen", async ({ page }) => {
    // JoinWizard should be visible — the first step is name/avatar/colour selection
    const controller = page.locator("[data-controller]");
    await expect(controller).toBeVisible();

    // The join wizard component itself should be present
    const wizard = page.locator("[data-component='join-wizard']");
    await expect(wizard).toBeVisible();
    // It should contain child elements (not empty)
    const hasAnyContent = (await page.locator("[data-controller] *").count()) > 0;
    expect(hasAnyContent).toBe(true);
  });

  test("controller phase attribute is 'join' on boot", async ({ page }) => {
    const controller = page.locator("[data-controller]");
    await expect(controller).toHaveAttribute("data-phase", "join");
  });

  test("controller layout has content", async ({ page }) => {
    // The controller island should have rendered its content inside the shared layout wrapper
    const island = page.locator("[data-island='controller']");
    await expect(island).toBeVisible();
    const contentCount = await page.locator("[data-island='controller'] *").count();
    expect(contentCount).toBeGreaterThan(0);
  });
});

test.describe("Phone controller — CSS loading (regression: redistribution)", () => {
  test("controller CSS is applied (not unstyled)", async ({ page }) => {
    await page.goto(`/controller/${FAKE_CODE}`);
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);

    // The controller element should have layout styles
    const controller = page.locator("[data-controller]");
    const display = await controller.evaluate(el => getComputedStyle(el).display);
    expect(["grid", "flex", "block"]).toContain(display);
  });

  test("design tokens active on phone route", async ({ page }) => {
    await page.goto(`/controller/${FAKE_CODE}`);
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    const tokenValue = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--clay-lemon").trim()
    );
    expect(tokenValue).toBeTruthy();
  });
});

test.describe("Phone controller — visual baseline", () => {
  test("join wizard matches visual baseline", async ({ page }) => {
    await page.goto(`/controller/${FAKE_CODE}`);
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("phone-join-wizard.png", {
      fullPage: false,
      animations: "disabled"
    });
  });
});
