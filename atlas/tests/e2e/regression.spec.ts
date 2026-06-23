/**
 * @file Regression spec — durable, behaviour-level tests for the round-2 bug reports, so a fix can
 * never be "falsely confirmed" again. Each test reproduces one reported behaviour end-to-end against
 * the live dev server (real WebSocket, real D1). Self-contained where it mutates: tests that change
 * data create their own issue so they never corrupt seed rows other specs assert on.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

/** Create a fresh Backlog issue on the platform board and return its id (keeps the seed untouched). */
async function freshIssue(page: import("@playwright/test").Page, title: string): Promise<string> {
  const res = await page.request.post("/api/boards/board-platform/columns/col-backlog/issues", {
    data: { title }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/** Create a fresh Engineering board and return its id (keeps the seed boards untouched). */
async function freshBoard(page: import("@playwright/test").Page, title: string): Promise<string> {
  const res = await page.request.post("/api/boards", {
    data: { departmentId: "dept-eng", title }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/**
 * Create a fresh board AND one issue in its first (Backlog) column. Isolates board-card assertions from
 * the shared platform board, whose Backlog fills with other tests' fresh issues within a server session.
 */
async function freshBoardWithIssue(
  page: import("@playwright/test").Page,
  boardTitle: string,
  issueTitle: string
): Promise<{ boardId: string; issueId: string }> {
  const boardId = await freshBoard(page, boardTitle);
  const boardRes = await page.request.get(`/api/boards/${boardId}`);
  const snap = (await boardRes.json()) as { columns: { id: string }[] };
  const columnId = snap.columns[0]?.id ?? "";
  const res = await page.request.post(`/api/boards/${boardId}/columns/${columnId}/issues`, {
    data: { title: issueTitle }
  });
  expect(res.ok()).toBeTruthy();
  const issueId = ((await res.json()) as { id: string }).id;
  return { boardId, issueId };
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await signIn(page);
});

test.describe("Board name + subtitle edit", () => {
  test("editing a board's name + subtitle persists and shows in the header", async ({ page }) => {
    const id = await freshBoard(page, "Board edit probe");
    await page.goto(`/board/${id}`);
    await page.waitForLoadState("load");

    await page.locator('[data-board-pill][data-active] [data-action="menu"]').click();
    await page.locator('[data-context-menu] [data-action="rename"]').click();
    await page.locator('[data-modal] [data-action="modal-input"]').fill("Edited board");
    await page.locator("[data-modal-subtitle]").fill("A crisp new subtitle.");
    await page.locator('[data-modal] button[data-action="confirm-modal"]').click();

    // Live in the header (scope to the header — [data-board-title] also marks the board pills).
    const headerTitle = page.locator("[data-board-header] [data-board-title]");
    await expect(headerTitle).toHaveText("Edited board", { timeout: 6000 });
    await expect(page.locator("[data-board-standfirst]")).toHaveText("A crisp new subtitle.", {
      timeout: 6000
    });

    // Persists across reload.
    await page.goto(`/board/${id}`);
    await page.waitForLoadState("load");
    await expect(headerTitle).toHaveText("Edited board");
    await expect(page.locator("[data-board-standfirst]")).toHaveText("A crisp new subtitle.");
  });
});

test.describe("Board/department change transition", () => {
  test("the working content has an entry transition (animates on navigation)", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // The suite globally emulates prefers-reduced-motion (for stable visual baselines), which correctly
    // disables this transition — opt back into motion at runtime to assert the animation is actually wired.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const animation = await page
      .locator('[data-page="board"]')
      .evaluate(el => getComputedStyle(el).animationName);
    // The board content carries a (non-"none") entry animation so board/department swaps transition.
    expect(animation).not.toBe("none");
    expect(animation).toContain("atlas-rise");
  });
});

test.describe("Realtime / optimistic updates", () => {
  test("attachment appears immediately after upload (no reload)", async ({ page }) => {
    const id = await freshIssue(page, "Attach-live probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-attach-add]")).toBeVisible();

    await page.locator("[data-attach-input]").setInputFiles({
      name: "live.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hi")
    });
    await expect(page.locator("[data-attachment]")).toHaveCount(1, { timeout: 6000 });
  });

  test("attachment persists across reload", async ({ page }) => {
    const id = await freshIssue(page, "Attach-persist probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page.locator("[data-attach-input]").setInputFiles({
      name: "persist.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hi")
    });
    await expect(page.locator("[data-attachment]")).toHaveCount(1, { timeout: 6000 });

    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-attachment]")).toHaveCount(1);
  });

  test("sub-issue appears immediately after Enter (no reload)", async ({ page }) => {
    const id = await freshIssue(page, "Sub-live probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    const field = page.locator("[data-sub-add-field]");
    await field.fill("First sub-task");
    await field.press("Enter");
    await expect(page.locator("[data-sub-issue]")).toHaveCount(1, { timeout: 6000 });
  });
});

test.describe("Realtime status → board", () => {
  test("changing status moves the board card LIVE while the panel is open", async ({ page }) => {
    const id = await freshIssue(page, "Live status board probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");

    await page.locator('[data-rail-field]:has([data-rail-label]:text-is("Status"))').click();
    await page.locator('[data-chooser-option][data-value="in_review"]').click();

    // The card (on the board behind the open panel) must move to In Review live — no reload.
    const reviewColumn = page.locator('[data-column][aria-label="In Review"]');
    await expect(reviewColumn.locator(`[data-card-id="${id}"]`)).toBeVisible({ timeout: 6000 });
  });

  test("after closing the issue (SPA, no reload) the card is in the new column", async ({
    page
  }) => {
    const id = await freshIssue(page, "Close status probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");

    await page.locator('[data-rail-field]:has([data-rail-label]:text-is("Status"))').click();
    await page.locator('[data-chooser-option][data-value="done"]').click();
    // Close via the × (SPA nav back to the board — not a full page reload).
    await page.locator('[data-bar-tools] button[data-action="close"]').click();

    const doneColumn = page.locator('[data-column][aria-label="Done"]');
    await expect(doneColumn.locator(`[data-card-id="${id}"]`)).toBeVisible({ timeout: 6000 });
  });

  test("changing priority updates the rail live (optimistic, no reload)", async ({ page }) => {
    const id = await freshIssue(page, "Priority live probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page.locator('[data-rail-field]:has([data-rail-label]:text-is("Priority"))').click();
    await page.locator('[data-chooser-option][data-value="urgent"]').click();
    const railPriority = page.locator(
      '[data-rail-field]:has([data-rail-label]:text-is("Priority")) [data-rail-value]'
    );
    await expect(railPriority).toContainText("Urgent", { timeout: 6000 });
  });
});

test.describe("Issue customization", () => {
  test("picking an icon updates the rail chip live", async ({ page }) => {
    const id = await freshIssue(page, "Icon rail probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page.locator("[data-icon-customize]").click();
    await page.locator('[data-icon-cell][data-value="rocket"]').click();
    await expect(page.locator('[data-icon-chip] [data-icon="rocket"]')).toBeVisible({
      timeout: 6000
    });
  });

  test("an issue's customized icon shows on its board card after reload", async ({ page }) => {
    // Use a fresh single-issue board so the card is always rendered (immune to platform Backlog buildup).
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Icon card board",
      "Icon card probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.locator("[data-icon-customize]").click();
    // Wait for the customize POST to persist before reloading — else the board re-fetch races the write.
    await Promise.all([
      page.waitForResponse(r => r.url().includes("/api/customize") && r.ok()),
      page.locator('[data-icon-cell][data-value="beaker"]').click()
    ]);
    await expect(page.locator('[data-icon-chip] [data-icon="beaker"]')).toBeVisible({
      timeout: 6000
    });

    await page.goto(`/board/${boardId}`);
    await page.waitForLoadState("load");
    const card = page.locator(`[data-card-id="${issueId}"]`);
    await expect(card.locator('[data-card-icon] [data-icon="beaker"]')).toBeVisible();
  });
});

test.describe("Issue editing persists", () => {
  test("inline title edit persists across reload", async ({ page }) => {
    const id = await freshIssue(page, "Title before");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page.locator("[data-issue-title]").dblclick();
    const input = page.locator("[data-title-edit]");
    await input.fill("Title after — verified");
    await input.press("Enter");

    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-title]")).toHaveText("Title after — verified");
  });

  test("milestone assignment persists across reload", async ({ page }) => {
    const id = await freshIssue(page, "Milestone probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page
      .locator('[data-rail-field]:has([data-rail-label]:text-is("Milestone / Cycle"))')
      .click();
    const field = page.locator("[data-ms-add-field]");
    await field.fill("Q9 Cycle");
    await field.press("Enter");

    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    const milestone = page.locator(
      '[data-rail-field]:has([data-rail-label]:text-is("Milestone / Cycle")) [data-rail-value]'
    );
    await expect(milestone).toHaveText("Q9 Cycle");
  });
});

test.describe("Milestone picker UI", () => {
  test("opens as a centered, on-screen modal (not off-screen)", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page
      .locator('[data-rail-field]:has([data-rail-label]:text-is("Milestone / Cycle"))')
      .click();
    const card = page.locator("[data-ms-card]");
    await expect(card).toBeVisible();
    // The card must be fully within the viewport (the old anchored popover landed at left:8 off the rail).
    const box = await card.boundingBox();
    const vw = page.viewportSize()?.width ?? 0;
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vw);
      // Centred-ish: its centre is past the first third of the viewport (not pinned to the left edge).
      expect(box.x + box.width / 2).toBeGreaterThan(vw / 3);
    }
  });
});

test.describe("Filter on mobile", () => {
  test.use({ viewport: { width: 390, height: 812 } });

  test("opens as a full-width bottom sheet with a dimming scrim", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.locator('[data-action="open-overflow"]').click();
    await page.locator('[data-overflow-sheet] [data-action="open-filter"]').click();

    const panel = page.locator("[data-filter-panel]");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Full-width sheet pinned to the bottom edge.
      expect(box.width).toBeGreaterThan(360);
      expect(box.y + box.height).toBeGreaterThanOrEqual(812 - 2);
    }
    // The dimming scrim covers the viewport so an outside tap dismisses.
    await expect(page.locator("[data-filter-panel] [data-scrim]")).toBeVisible();
  });
});
