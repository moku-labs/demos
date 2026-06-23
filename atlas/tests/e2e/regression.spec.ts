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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await signIn(page);
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
    const id = await freshIssue(page, "Icon card probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page.locator("[data-icon-customize]").click();
    await page.locator('[data-icon-cell][data-value="beaker"]').click();
    await expect(page.locator('[data-icon-chip] [data-icon="beaker"]')).toBeVisible({
      timeout: 6000
    });

    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    const card = page.locator(`[data-card-id="${id}"]`);
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
