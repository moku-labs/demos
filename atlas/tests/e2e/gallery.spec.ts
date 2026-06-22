/**
 * @file Gallery — comprehensive screenshot capture of EVERY screen/state across viewports + themes.
 *
 * Saves PNGs to `test-results/gallery/` for visual review (not `toHaveScreenshot` baselines — those
 * are blessed only after the renders are confirmed correct). Drives the real app via the now-working
 * Playwright runner (Node 24 + PW 1.61). Run: `bun run test:e2e gallery.spec.ts` (server on :7979).
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

const DIR = "test-results/gallery";

/** Viewports to capture (label → size). */
const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 }
} as const;

/**
 * Freeze fonts, then screenshot to the gallery dir. `fullPage` defaults true for whole screens; pass
 * false for fixed-position overlays/menus/modals so they composite at their true VIEWPORT coordinates
 * (a fullPage capture pins `position:fixed` layers to the layout origin and misrepresents placement).
 */
async function shot(
  page: import("@playwright/test").Page,
  name: string,
  fullPage = true
): Promise<void> {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage }).catch(() => {});
}

/** Toggle the app into dark theme via the masthead theme-toggle island. */
async function goDark(page: import("@playwright/test").Page): Promise<void> {
  await page
    .locator("[data-masthead] [data-tool='theme']")
    .click()
    .catch(() => {});
  await page.waitForTimeout(250);
}

for (const [vp, size] of Object.entries(VIEWPORTS)) {
  test.describe(`gallery — ${vp}`, () => {
    test.use({ viewport: size });

    test(`${vp}: auth screens`, async ({ page }) => {
      await page.clock.setFixedTime(FIXED_TIME);
      await page.goto("/signin");
      await page.waitForLoadState("load");
      await expect(page.locator("input[name='email']")).toBeVisible();
      await shot(page, `${vp}-A1-signin`);
      await page.goto("/signup");
      await page.waitForLoadState("load");
      await shot(page, `${vp}-A2-signup`);
    });

    test(`${vp}: core app screens`, async ({ page }) => {
      await page.clock.setFixedTime(FIXED_TIME);
      await signIn(page);

      // A3 board (home / Platform)
      await page.goto("/board/board-platform");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-column]").first()).toBeVisible();
      await shot(page, `${vp}-A3-board`);

      // A4 list
      await page.goto("/board/board-platform/list");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-listview]")).toBeVisible();
      await shot(page, `${vp}-A4-list`);

      // A5 issue
      await page.goto("/board/board-platform/issue/issue-ws-reconnect");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-issue-panel]")).toBeVisible();
      await shot(page, `${vp}-A5-issue`, false);

      // C1 activity (deep-link)
      await page.goto("/board/board-platform/activity");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-activity-panel] [data-drawer]")).toBeVisible();
      await shot(page, `${vp}-C1-activity`, false);

      // dark theme board
      await page.goto("/board/board-platform");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-column]").first()).toBeVisible();
      await goDark(page);
      await shot(page, `${vp}-A3-board-dark`);
    });

    test(`${vp}: a different department board`, async ({ page }) => {
      await page.clock.setFixedTime(FIXED_TIME);
      await signIn(page);
      await page.goto("/board/board-brand");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-board-header]")).toBeVisible();
      await shot(page, `${vp}-A3-board-brand`);
    });
  });
}

// ── Overlays / menus / modals (desktop) ────────────────────────────────────────
test.describe("gallery — overlays (desktop)", () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
  });

  test("C2 filter panel", async ({ page }) => {
    await page.locator("[data-masthead] [data-tool='filter']").click();
    await expect(page.locator("[data-filter-panel]")).toBeVisible();
    await shot(page, "overlay-C2-filter", false);
  });

  test("C3 customize panel (from column menu)", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await page.locator("[data-context-menu]").getByText("Customize").first().click();
    await expect(page.locator("[data-customize-panel]")).toBeVisible();
    await shot(page, "overlay-C3-customize", false);
  });

  test("D1 column menu", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await expect(page.locator("[data-context-menu]")).toBeVisible();
    await shot(page, "overlay-D1-column-menu", false);
  });

  test("D1 card menu", async ({ page }) => {
    const card = page.locator("[data-card-id='issue-ws-reconnect']");
    await card.hover();
    await card.locator("[data-action='card-menu']").click();
    await expect(page.locator("[data-context-menu]")).toBeVisible();
    await shot(page, "overlay-D1-card-menu", false);
  });

  test("D2 user menu", async ({ page }) => {
    await page.locator("[data-masthead] [data-tool='user']").click();
    await expect(page.locator("[data-context-menu][data-variant='user']")).toBeVisible();
    await shot(page, "overlay-D2-user-menu", false);
  });

  test("E2 add-card modal", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-add-card]").click();
    await expect(page.locator("[data-modal]")).toBeVisible();
    await shot(page, "overlay-E2-add-modal", false);
  });

  test("E1 delete-confirm modal", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await page.locator("[data-context-menu]").getByText("Delete").first().click();
    await expect(page.locator("[data-modal]")).toBeVisible();
    await shot(page, "overlay-E1-delete-modal", false);
  });

  test("A5 issue edit-mode (markdown editor)", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible();
    const editToggle = page
      .locator("[data-issue-panel]")
      .locator("[data-action='toggle-edit'], button:has-text('Edit')")
      .first();
    if (await editToggle.isVisible().catch(() => false)) {
      await editToggle.click();
      await page.waitForTimeout(150);
    }
    await shot(page, "overlay-A5-issue-edit", false);
  });
});
