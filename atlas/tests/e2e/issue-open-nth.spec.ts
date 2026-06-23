/**
 * @file Priority-zero regression guard: "issue does not open (or only one opens)".
 *
 * The SPA view-transition refactor (commits 194fca0 + 6c7370b) moved the board and issue
 * islands into the persistent chrome and switched to `document.startViewTransition` for
 * section swaps. A potential regression: the issue island's `onNavEnd` `sync()` is
 * idempotent and handles the case where `ctx.state.issueId === issueId` (same issue),
 * but may fail to re-open when the user navigates to a DIFFERENT issue. These tests guard
 * all paths:
 *
 *   1. Click issue A → panel opens
 *   2. Close → back on board
 *   3. Click issue B (DIFFERENT) → panel must open for B (not A, not nothing)
 *   4. Navigate to issue C via SPA card click (third issue)
 *   5. Hard-load a deep-link URL → must open the panel
 *   6. Open issue A, then directly navigate to issue B (no close step) → must switch
 *
 * The deep-link tests create their issues on a throwaway board (all of one test's issues share
 * ONE fresh board, so the "persistent board · issue-section swap" gesture is reproduced exactly)
 * — this keeps the canonical `board-platform` pristine for the visual baselines (see _fixtures.ts).
 * The real-click tests use always-present seed cards on `board-platform` (read-only).
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";
import { backlogColumnId, freshBoard, freshBoardWithIssue, freshIssueIn } from "./_fixtures";

test.describe("Issue open — Nth issue must open (not just the first)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("REAL CLICK: open card A → close → click a DIFFERENT card B → B opens (regression: only one opened)", async ({
    page
  }) => {
    // The original bug: clicking a card navigated to /issue/{id} but the panel rendered ONLY for the
    // first issue of the session; every subsequent card-click changed the URL yet showed no panel (and
    // left the scroll-lock stuck, so the board felt frozen). Deep-link goto() hid it — only a real
    // SPA card click → close → click a different card reproduces it. Two always-present seed cards in
    // the platform Backlog column (visible without scrolling at a tall viewport) keep this deterministic.
    const A = "issue-ws-reconnect";
    const B = "issue-do-hibernation";

    const errors: string[] = [];
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector(`[data-card-id="${A}"]`);
    await page.waitForSelector(`[data-card-id="${B}"]`);

    // Open A via a real card click.
    await page.locator(`[data-card-id="${A}"] [data-card-title]`).click();
    await page.waitForURL(new RegExp(`/issue/${A}$`));
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible();

    // Close back to the board.
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(/\/board\/board-platform$/);

    // Click the DIFFERENT card B — the panel MUST open for B (the symptom was: nothing opened).
    await page.locator(`[data-card-id="${B}"] [data-card-title]`).click();
    await page.waitForURL(new RegExp(`/issue/${B}$`));
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible();

    // The scroll-lock must be released after closing B (board not left frozen). onNavEnd→closePanel
    // runs just after the URL settles, so poll instead of reading the attribute once.
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(/\/board\/board-platform$/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.overlayIssue !== undefined))
      .toBe(false);

    // Re-open A a third time (open → close → open the original again) — still opens.
    await page.locator(`[data-card-id="${A}"] [data-card-title]`).click();
    await page.waitForURL(new RegExp(`/issue/${A}$`));
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("second issue opens after first is closed (deep-link open→close→deep-link open different issue)", async ({
    page
  }) => {
    // Both issues share ONE throwaway board — the board island stays mounted across the issue swap,
    // exactly the persistent-board path the regression targets (and board-platform stays pristine).
    const boardId = await freshBoard(page, "Issue-open second board");
    const columnId = await backlogColumnId(page, boardId);
    const idA = await freshIssueIn(page, boardId, columnId, "Issue open probe A");
    const idB = await freshIssueIn(page, boardId, columnId, "Issue open probe B");

    // Open first issue via deep link (immune to board column overflow — doesn't need the card visible).
    await page.goto(`/board/${boardId}/issue/${idA}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    const titleA = await page.locator("[data-issue-title]").textContent();
    expect(titleA).toContain("Issue open probe A");

    // Close via × button — navigates back to the board.
    const closeBtn = page.locator('[data-bar-tools] button[data-action="close"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await page.waitForURL(new RegExp(`/board/${boardId}$`));
    // The panel must become hidden (no `[data-issue-panel]` or its aside is hidden).
    await expect(page.locator("[data-issue-panel]")).toBeHidden();

    // Open DIFFERENT issue (B) via SPA navigation — the board's onNavEnd must pick up the new issueId.
    await page.goto(`/board/${boardId}/issue/${idB}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    const titleB = await page.locator("[data-issue-title]").textContent();
    expect(titleB).toContain("Issue open probe B");
  });

  test("third issue opens after opening and closing two others (three distinct opens)", async ({
    page
  }) => {
    const boardId = await freshBoard(page, "Issue-open third board");
    const columnId = await backlogColumnId(page, boardId);
    const idA = await freshIssueIn(page, boardId, columnId, "Third open probe A");
    const idB = await freshIssueIn(page, boardId, columnId, "Third open probe B");
    const idC = await freshIssueIn(page, boardId, columnId, "Third open probe C");

    for (const [id, title] of [
      [idA, "Third open probe A"],
      [idB, "Third open probe B"],
      [idC, "Third open probe C"]
    ] as [string, string][]) {
      // Open via deep link — immune to board column overflow.
      await page.goto(`/board/${boardId}/issue/${id}`);
      await page.waitForLoadState("load");
      await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
      await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
      const text = await page.locator("[data-issue-title]").textContent();
      expect(text).toContain(title);

      // Close.
      const closeBtn = page.locator('[data-bar-tools] button[data-action="close"]');
      await closeBtn.click();
      await page.waitForURL(new RegExp(`/board/${boardId}$`));
      await expect(page.locator("[data-issue-panel]")).toBeHidden();
    }
  });

  test("switching directly from one open issue to another (no close step) — panel shows new issue", async ({
    page
  }) => {
    const boardId = await freshBoard(page, "Issue-open switch board");
    const columnId = await backlogColumnId(page, boardId);
    const idA = await freshIssueIn(page, boardId, columnId, "Switch probe A");
    const idB = await freshIssueIn(page, boardId, columnId, "Switch probe B");

    // Open A.
    await page.goto(`/board/${boardId}/issue/${idA}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    expect(await page.locator("[data-issue-title]").textContent()).toContain("Switch probe A");

    // Navigate to B (deep-link — no close step).
    await page.goto(`/board/${boardId}/issue/${idB}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    const titleB = await page.locator("[data-issue-title]").textContent();
    expect(titleB).toContain("Switch probe B");
  });

  test("hard-load deep-link URL opens the issue panel directly", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Deeplink open board",
      "Deeplink open probe"
    );

    // Hard-load the issue URL (no SPA nav from the board).
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-panel]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    expect(await page.locator("[data-issue-title]").textContent()).toContain("Deeplink open probe");
  });

  test("Escape key closes the panel and board columns are visible", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Escape close board",
      "Escape close probe"
    );

    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });

    await page.keyboard.press("Escape");
    await page.waitForURL(new RegExp(`/board/${boardId}$`));
    await expect(page.locator("[data-column]").first()).toBeVisible();
    // After close, the aside is hidden — the panel element is removed from the DOM.
    await expect(page.locator("[data-issue-panel]")).toBeHidden();
  });

  test("SPA card click → panel opens without a full-page reload (using a seed issue always visible)", async ({
    page
  }) => {
    // Use the seed issue "issue-ws-reconnect" which is always in the In Review column (3 issues),
    // and is always visible without scrolling — immune to the Backlog overflow problem.
    const SEED_ISSUE = "issue-ws-reconnect";

    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // Seed card is always in the In Review column (first 3 in that column).
    await page.waitForSelector(`[data-card-id="${SEED_ISSUE}"]`);

    // Count full reloads — SPA nav must not trigger any (beyond the initial page load).
    let reloads = 0;
    page.on("load", () => {
      reloads += 1;
    });

    await page.locator(`[data-card-id="${SEED_ISSUE}"] [data-card-title]`).click();
    await page.waitForURL(new RegExp(`/issue/${SEED_ISSUE}$`));
    await expect(page.locator("[data-issue-title]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-issue-panel]")).toBeVisible();

    // Only the initial page.goto counts; clicking should NOT have triggered another full load.
    expect(reloads).toBe(0);
  });
});
