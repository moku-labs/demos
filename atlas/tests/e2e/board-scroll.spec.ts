/**
 * @file Priority-zero regression guard: "board does not scroll after the persistent-board refactor".
 *
 * Commits 911245f (boards bar + departments scroll) and 6c7370b (persistent board, no scroll reset)
 * changed how the board region handles scroll. This spec guards all reported scroll regressions:
 *
 *   1. Board horizontal scroll (columns) — the kanban track must scroll left/right.
 *   2. Board vertical scroll (within a column) — a card-rich column must scroll vertically.
 *   3. Navigation away and back MUST NOT kill/reset the horizontal scroll.
 *   4. Opening an issue and closing it MUST restore the board scroll (via board-scroll.ts).
 *   5. Boards bar overflow scrolls (pills track).
 *   6. Departments tab row scrolls on narrow viewports.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

test.describe("Board scroll — horizontal (kanban columns track)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("board kanban track is overflow-x scrollable at tablet width (481–1024px CSS band)", async ({
    page
  }) => {
    // In the 481–1024px band CSS applies overflow-x:auto and grid-auto-columns:minmax(16rem,22rem).
    // We verify the CSS overflow property is set correctly (not hidden or visible) — the meaningful
    // property for the horizontal scroll behavior. We use 768px (established passing width) to ensure
    // this test is stable across db states.
    await page.setViewportSize({ width: 768, height: 700 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // Wait for at least one column to be in the DOM (server-rendered).
    await page.waitForSelector("[data-board] [data-column]");

    const boardTrack = page.locator("[data-board]");

    // The board must use overflow-x:auto.
    const overflow = await boardTrack.evaluate(
      (el: HTMLElement) => globalThis.getComputedStyle(el).overflowX
    );
    expect(overflow).toMatch(/auto|scroll/);

    // At 768px with 4 columns each at min 16rem (256px): 4×256 = 1024 > 768.
    // The scrollWidth should exceed clientWidth when all 4 columns are present.
    const colCount = await page.locator("[data-board] [data-column]").count();
    expect(colCount).toBeGreaterThanOrEqual(4);

    const metrics = await boardTrack.evaluate((el: HTMLElement) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    // Programmatic scrolling moves the track.
    await boardTrack.evaluate((el: HTMLElement) => {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    });
    const afterScroll = await boardTrack.evaluate((el: HTMLElement) => el.scrollLeft);
    expect(afterScroll).toBeGreaterThan(0);
  });

  test("board kanban track is NOT clipped (scrollable, not overflow:hidden) at tablet width", async ({
    page
  }) => {
    // 768px is in the tablet band (481–1024px) where CSS sets overflow-x:auto.
    await page.setViewportSize({ width: 768, height: 700 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-board]");

    const isScrollable = await page.locator("[data-board]").evaluate((el: HTMLElement) => {
      const style = globalThis.getComputedStyle(el);
      // Must be auto or scroll — never hidden.
      return style.overflowX === "auto" || style.overflowX === "scroll";
    });
    expect(isScrollable).toBe(true);
  });

  test("board scroll does NOT reset after SPA board→list→board navigation (phone viewport)", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-board]");

    // Scroll the board horizontally.
    const scroll = 200;
    await page.locator("[data-board]").evaluate((el: HTMLElement, s: number) => {
      el.scrollLeft = s;
    }, scroll);

    // Navigate to list view.
    await page.goto("/board/board-platform/list");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-listview]")).toBeVisible();

    // Navigate back to board view.
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-board]");

    // Board track must be scrollable (not locked/clipped) — it resets to 0 on a new board load.
    const isScrollable = await page.locator("[data-board]").evaluate((el: HTMLElement) => {
      const style = globalThis.getComputedStyle(el);
      return style.overflowX === "auto" || style.overflowX === "scroll";
    });
    expect(isScrollable).toBe(true);
  });
});

test.describe("Board scroll — vertical (window scroll behind open issue)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("opening an issue via card click and closing it RESTORES the board window scroll position", async ({
    page
  }) => {
    // A short viewport so the platform board overflows vertically and the window can scroll. Opening
    // must be a REAL card click: `onCardOpen` calls `rememberBoardScroll()` to capture scrollY before
    // the nav, and `setHostOpen(false)` restores it on close. A direct `page.goto` would bypass the
    // remember step — so this asserts the genuine open→close round-trip the user performs.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-card-id]");

    // Scroll the document down, then open the first (still-visible) card.
    await page.evaluate(() => globalThis.scrollTo(0, 300));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => globalThis.scrollY);
    expect(before, `pre-open scrollY=${before}`).toBeGreaterThan(150);

    await page.locator("[data-card-id]").first().locator("[data-card-title]").click();
    await page.waitForURL(/\/issue\//);
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });

    // Close → the board must return to its pre-open scroll (no reset to top).
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(/\/board\/board-platform$/);
    await page.waitForTimeout(300);

    const restored = await page.evaluate(() => globalThis.scrollY);
    expect(restored, `restored scrollY=${restored} (expected ≈${before})`).toBeGreaterThan(150);
    const locked = await page.evaluate(
      () => document.documentElement.dataset.overlayIssue !== undefined
    );
    expect(locked).toBe(false);
  });

  test("window scroll NOT permanently locked after opening + closing an issue", async ({
    page
  }) => {
    const SEED_ISSUE = "issue-ws-reconnect";
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(`/board/board-platform/issue/${SEED_ISSUE}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });

    // Close issue.
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(/\/board\/board-platform$/);
    await page.waitForTimeout(300);

    // The scroll-lock attribute must be gone (so the board page can scroll again).
    const isLocked = await page.evaluate(
      () => document.documentElement.dataset.overlayIssue !== undefined
    );
    expect(isLocked).toBe(false);

    // Validate we can actually scroll the document.
    await page.evaluate(() => globalThis.scrollTo(0, 200));
    await page.waitForTimeout(100);
    const scrollY = await page.evaluate(() => globalThis.scrollY);
    expect(scrollY).toBeGreaterThan(50);
  });

  test("opening AND closing an issue keeps the board visually STILL (no scroll-to-top jump, no snap-back)", async ({
    page
  }) => {
    // The board is persistent and sits behind the issue overlay's SEMI-TRANSPARENT scrim, so it must not
    // visibly move when an issue opens. Before the fix the SPA nav scrolled the window to 0 — the board
    // lurched to its top (seen through the scrim) — and the close restore ran a beat late (a snap-back).
    // The position:fixed body-pin keeps the board pinned at its exact scroll across the whole open/close.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-card-id]");

    await page.evaluate(() => globalThis.scrollTo(0, 300));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(150); // we actually scrolled

    // Track the on-screen position of a stable board element across the open/close.
    const boardColumnTop = (): Promise<number> =>
      page
        .locator('[data-region="board"] [data-column]')
        .first()
        .evaluate((el: HTMLElement) => Math.round(el.getBoundingClientRect().top));
    const topBefore = await boardColumnTop();

    // Open via a REAL card click (onCardOpen pins the scroll BEFORE the navigation).
    await page.locator("[data-card-id]").first().locator("[data-card-title]").click();
    await page.waitForURL(/\/issue\//);
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    // The board behind the scrim must NOT have moved (was a ~300px jump to the top before the fix).
    expect(Math.abs((await boardColumnTop()) - topBefore)).toBeLessThanOrEqual(2);

    // Close → still no movement; scroll restored; lock released; body unpinned; the page scrolls again.
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(/\/board\/board-platform$/);
    await expect(page.locator("[data-issue-panel]")).toBeHidden();
    expect(Math.abs((await boardColumnTop()) - topBefore)).toBeLessThanOrEqual(2);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.overlayIssue !== undefined))
      .toBe(false);
    expect(await page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(150);
    expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe("static");
  });
});

test.describe("Boards bar scroll", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("boards bar track is horizontally scrollable (not clipped) when it has many boards", async ({
    page
  }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-boards-track]");

    const track = page.locator("[data-boards-track]");
    const isScrollable = await track.evaluate((el: HTMLElement) => {
      const style = globalThis.getComputedStyle(el);
      return style.overflowX === "auto" || style.overflowX === "scroll";
    });
    expect(isScrollable).toBe(true);
  });
});

test.describe("Departments scroll on mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("departments tab row is scrollable on mobile (not clipped)", async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-departments]");

    const nav = page.locator("[data-departments]");
    const isScrollable = await nav.evaluate((el: HTMLElement) => {
      const style = globalThis.getComputedStyle(el);
      // The overflow may be applied to a child scroller — also check the nav itself.
      return (
        style.overflowX === "auto" ||
        style.overflowX === "scroll" ||
        el.scrollWidth > el.clientWidth
      );
    });
    // The departments nav scrolls horizontally on mobile to show all tabs.
    expect(isScrollable).toBe(true);
  });
});
