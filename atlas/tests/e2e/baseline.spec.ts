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

/**
 * Gate a capture to the chromium (desktop) project. Two reasons a signed-in board/overlay capture is
 * desktop-only: (1) fullPage board captures screenshot the shared `board-platform`, whose Backlog other
 * specs mutate during the run — the chromium project's visual baseline runs BEFORE those mutators
 * (alphabetical), but the chromium-mobile project runs AFTER the entire chromium project, so the same
 * capture would pin a polluted, run-dependent board; (2) overlay open-paths differ on mobile (tools
 * collapse into the masthead overflow sheet), so the desktop open sequence doesn't apply. Mobile keeps
 * the chrome region captures below (masthead/boards-bar/header/footer/card — which exercise the mobile
 * masthead's overflow form and are board-pollution-immune) plus responsive.spec's mobile-width checks.
 */
function desktopOnly(): void {
  test.skip(
    test.info().project.name === "chromium-mobile",
    "desktop-only capture — mobile coverage is the region captures + responsive.spec (see note)"
  );
}

/** Gate a capture to the chromium-mobile project (iPhone 14 / WebKit @ 390px) — the mobile-form captures. */
function mobileOnly(): void {
  test.skip(
    test.info().project.name !== "chromium-mobile",
    "mobile-only capture — the desktop forms are covered above"
  );
}

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
    desktopOnly();
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // Wait for columns to be visible (board island rendered)
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("board-platform-desktop.png", { fullPage: true });
  });

  test("A4 List view (Platform board)", async ({ page }) => {
    desktopOnly();
    await page.goto("/board/board-platform/list");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-listview]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("list-platform-desktop.png", { fullPage: true });
  });

  test("A5 Issue page (issue-ws-reconnect)", async ({ page }) => {
    desktopOnly();
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible();
    await prepareScreenshot(page);
    // The issue panel is a position:fixed inset:0 overlay — capture the VIEWPORT, not fullPage. A
    // fullPage shot stretches/pins the fixed layer against the tall document behind it, compositing the
    // board + footer around the article (a misleading "broken" golden). fullPage:false shows what the
    // user actually sees: the full-screen overlay (dimmed board scrim + the article rail).
    await expect(page).toHaveScreenshot("issue-ws-reconnect-desktop.png", { fullPage: false });
  });

  test("A5 Issue page — description editor (edit mode with Save/Cancel)", async ({ page }) => {
    desktopOnly();
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible();

    // Open the inline description editor.
    await page.locator('[data-action="edit-description"]').click();
    await expect(page.locator("[data-desc-edit]")).toBeVisible();
    await expect(page.locator('[data-action="save-description"]')).toBeVisible();
    await prepareScreenshot(page);

    // Capture the viewport (fixed overlay) so the Save/Cancel row is visible below the textarea.
    await expect(page).toHaveScreenshot("issue-desc-edit-desktop.png", { fullPage: false });
  });

  test("C1 Activity log drawer open", async ({ page }) => {
    desktopOnly();
    await page.goto("/board/board-platform/activity");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-activity-panel]")).toBeVisible();
    await prepareScreenshot(page);
    // Capture the drawer ELEMENT, not the viewport: "The Record" is a fixed right-side panel, so an
    // element shot is a tight, board-pollution-immune capture (no board/footer framing noise).
    await expect(page.locator("[data-activity-panel]")).toHaveScreenshot("activity-drawer.png");
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
    desktopOnly();
    await page.goto("/");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true });
  });
});

test.describe("Overlays & popups — visual baselines (desktop)", () => {
  // Each opens an overlay on the clean platform board and captures the OVERLAY ELEMENT — a tight,
  // board-pollution-immune shot (no board behind). Desktop-only: the open-paths differ on mobile
  // (tools collapse into the masthead overflow sheet). No test submits/mutates, so the board stays
  // pristine for the region captures.
  test.beforeEach(async ({ page }) => {
    desktopOnly();
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
  });

  test("C2 Filter panel (popover)", async ({ page }) => {
    await page.locator("[data-boards-bar] [data-action='open-filter']").click();
    await expect(page.locator("[data-filter-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-filter-panel]")).toHaveScreenshot("filter-panel.png");
  });

  test("C3 Customize panel (from column menu)", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await page.locator("[data-context-menu]").getByText("Customize").first().click();
    await expect(page.locator("[data-customize-panel]")).toBeVisible();
    await prepareScreenshot(page);
    // Capture the inner card (not the full overlay) — excludes the scrim/dimmed board → clean + immune.
    await expect(page.locator("[data-customize-card]")).toHaveScreenshot("customize-panel.png");
  });

  test("D1 Card context menu", async ({ page }) => {
    const card = page.locator("[data-card-id='issue-ws-reconnect']");
    await card.hover();
    await card.locator("[data-action='card-menu']").click();
    await expect(page.locator("[data-context-menu]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-context-menu]")).toHaveScreenshot("context-menu-card.png");
  });

  test("E2 Add-card modal (prompt)", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-add-card]").click();
    await expect(page.locator("[data-modal]")).toBeVisible();
    await prepareScreenshot(page);
    // Capture the inner dialog (not the scrim/dimmed board behind) → clean + pollution-immune.
    await expect(page.locator("[data-dialog]")).toHaveScreenshot("modal-add-card.png");
  });

  test("E1 Delete-confirm modal", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await page.locator("[data-context-menu]").getByText("Delete").first().click();
    await expect(page.locator("[data-modal]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-dialog]")).toHaveScreenshot("modal-delete-confirm.png");
  });
});

test.describe("Mobile overlays — visual baselines (iPhone 14)", () => {
  // Mobile-only (WebKit @ 390px). Each overlay's MOBILE form (full-screen panel / bottom sheet), opened
  // via the masthead overflow sheet where the desktop boards-bar controls collapse on phones. Element
  // captures → board-pollution-immune (no board behind the overlay in the shot), so deterministic even
  // though the mobile project runs after the chromium project mutates the shared board.
  test.beforeEach(async ({ page }) => {
    mobileOnly();
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
  });

  test("Issue panel — mobile (full-screen)", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-issue-panel]")).toHaveScreenshot("issue-mobile.png");
  });

  test("Overflow sheet — mobile (D3)", async ({ page }) => {
    await page.locator('[data-action="open-overflow"]').click();
    await expect(page.locator("[data-overflow-sheet]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-overflow-sheet]")).toHaveScreenshot(
      "overflow-sheet-mobile.png"
    );
  });

  test("Filter sheet — mobile", async ({ page }) => {
    await page.locator('[data-action="open-overflow"]').click();
    await page.locator('[data-overflow-sheet] [data-action="open-filter"]').click();
    await expect(page.locator("[data-filter-panel]")).toBeVisible();
    await prepareScreenshot(page);
    // Hide the dimming scrim (the gray board-dim backdrop behind the bottom sheet) so the golden is just
    // the filter sheet. The scrim is intended UX but reads as a broken gray overlay in a static baseline
    // and is board-dependent; with it gone, [data-filter-panel] is the clean bottom-sheet box.
    await page.addStyleTag({ content: "[data-scrim] { display: none !important; }" });
    await expect(page.locator("[data-filter-panel]")).toHaveScreenshot("filter-mobile.png");
  });

  test("Activity sheet — mobile", async ({ page }) => {
    await page.locator('[data-action="open-overflow"]').click();
    await page.locator('[data-overflow-sheet] [data-action="open-activity"]').click();
    await expect(page.locator("[data-activity-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-activity-panel]")).toHaveScreenshot("activity-mobile.png");
  });

  test("Add-card modal — mobile", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-add-card]").click();
    await expect(page.locator("[data-modal]")).toBeVisible();
    await prepareScreenshot(page);
    // Inner dialog only — the mobile bottom-sheet's board-behind is pollution-fragile; the dialog is not.
    await expect(page.locator("[data-dialog]")).toHaveScreenshot("modal-add-card-mobile.png");
  });

  test("Customize panel — mobile (from column menu)", async ({ page }) => {
    await page.locator("[data-column]").first().locator("[data-action='menu']").click();
    await page.locator("[data-context-menu]").getByText("Customize").first().click();
    await expect(page.locator("[data-customize-panel]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page.locator("[data-customize-card]")).toHaveScreenshot("customize-mobile.png");
  });
});

test.describe("Mobile screens — visual baselines (iPhone 14)", () => {
  // Comprehensive mobile coverage: full-PAGE captures of the core SCREENS (board · list · home) in their
  // iPhone-14 form — the gap the overlay-only mobile block above left open. board-platform is read-only
  // across the whole suite (every mutator uses a throwaway board — see _fixtures.ts), so these fullPage
  // captures are deterministic even though the mobile project runs after the chromium project's mutators.
  test.beforeEach(async ({ page }) => {
    mobileOnly();
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("A3 Board view — mobile (single-column + pager)", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("board-platform-mobile.png", { fullPage: true });
  });

  test("A4 List view — mobile", async ({ page }) => {
    await page.goto("/board/board-platform/list");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-listview]")).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("list-platform-mobile.png", { fullPage: true });
  });

  test("Home / (default board) — mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-column]").first()).toBeVisible();
    await prepareScreenshot(page);
    await expect(page).toHaveScreenshot("home-mobile.png", { fullPage: true });
  });
});

test.describe("Dark theme — visual baseline", () => {
  test.use({ colorScheme: "dark" });

  test("A3 Board view — dark theme", async ({ page }) => {
    desktopOnly();
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
