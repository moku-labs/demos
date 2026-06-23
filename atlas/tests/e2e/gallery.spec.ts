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

/**
 * Toggle the app into dark theme via the masthead theme-toggle (skips gracefully when the tool is
 * collapsed into the mobile header overflow — the click is bounded so it can't stall the capture).
 */
async function goDark(page: import("@playwright/test").Page): Promise<void> {
  await page
    .locator("[data-masthead] [data-tool='theme']")
    .click({ timeout: 2500 })
    .catch(() => {});
  await page.waitForTimeout(250);
}

/**
 * Seed the persisted theme (`atlas:theme`) and reload so the theme-toggle island applies it on mount.
 *
 * This is the deterministic path to dark mode on every viewport: unlike {@link goDark}, it does not
 * depend on the masthead toggle being reachable (the toggle is `display:none` at ≤760px, where dark is
 * otherwise only reachable through the mobile overflow sheet), so mobile dark captures composite
 * reliably without touching app code.
 *
 * @param page - The Playwright page (must already be on an app route so the reload re-mounts islands).
 * @param theme - The theme to persist and apply.
 * @returns Resolves once the page has reloaded with the theme applied to the document root.
 */
async function setTheme(
  page: import("@playwright/test").Page,
  theme: "light" | "dark"
): Promise<void> {
  await page.evaluate(t => localStorage.setItem("atlas:theme", t), theme);
  await page.reload();
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

/**
 * Clear the persisted filter selection (`atlas:filter`) and reload so the board/list renders the full,
 * unnarrowed snapshot.
 *
 * The filter is "everywhere and remembered" (persisted in `localStorage`), and the board island feeds
 * the same filter-narrowed snapshot to both the kanban and list surfaces — so a left-over selection can
 * empty the list into its no-results state. Clearing it before a capture guarantees the populated table.
 *
 * @param page - The Playwright page (must already be on an app route so the reload re-mounts islands).
 * @returns Resolves once the page has reloaded with no active filter.
 */
async function clearFilter(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem("atlas:filter"));
  await page.reload();
  await page.waitForLoadState("load");
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

      // A4 list — clear any persisted filter first so the populated table renders (not the
      // filter-narrowed no-results state).
      await page.goto("/board/board-platform/list");
      await page.waitForLoadState("load");
      await clearFilter(page);
      await expect(page.locator("[data-listview]")).toBeVisible();
      await expect(page.locator("[data-list-group]").first()).toBeVisible();
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

    // C3 customize popover (from a column "⋯ → Customize") captured per viewport in both themes — so
    // the mobile + dark variants are covered, not just the desktop/light `overlay-C3-customize` shot.
    // The panel is a fixed-position overlay, so capture it with fullPage:false at its true coordinates.
    test(`${vp}: C3 customize panel (light + dark)`, async ({ page }) => {
      await page.clock.setFixedTime(FIXED_TIME);
      await signIn(page);
      await page.goto("/board/board-platform");
      await page.waitForLoadState("load");
      await expect(page.locator("[data-column]").first()).toBeVisible();

      const openCustomize = async () => {
        await page.locator("[data-column]").first().locator("[data-action='menu']").click();
        await page.locator("[data-context-menu]").getByText("Customize").first().click();
        await expect(page.locator("[data-customize-panel]")).toBeVisible();
      };

      await openCustomize();
      await shot(page, `${vp}-C3-customize`, false);

      // Dark: seed the persisted theme + reload (deterministic on mobile, where the masthead toggle is
      // hidden), then re-open the panel since the reload dismisses the overlay.
      await setTheme(page, "dark");
      await expect(page.locator("[data-column]").first()).toBeVisible();
      await openCustomize();
      await shot(page, `${vp}-C3-customize-dark`, false);
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
    // Filter lives in the boards bar (B3) on desktop, not the masthead (see Masthead.tsx / BoardsBar.tsx).
    await page.locator("[data-boards-bar] [data-action='open-filter']").click();
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
