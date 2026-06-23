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

test.describe("Boards bar overflow scrolling (#many-boards)", () => {
  test("a board bar with many boards scrolls, flags overflow, and keeps the active pill in view", async ({
    page
  }) => {
    // Create enough boards on Engineering to overflow the bar at desktop width (8 ≈ 1100px of pills > the
    // ~870px track at 1280, with the seed boards on top — kept modest to limit load on the dev server).
    for (let i = 0; i < 8; i++) {
      const res = await page.request.post("/api/boards", {
        data: { departmentId: "dept-eng", title: `Overflow scroll probe ${i}` }
      });
      expect(res.ok()).toBeTruthy();
    }
    const boardsRes = await page.request.get("/api/departments/dept-eng/boards");
    const deptBoards = (await boardsRes.json()) as Array<{ id: string }>;
    const lastId = deptBoards.at(-1)?.id ?? "";

    await page.setViewportSize({ width: 1280, height: 860 });
    // Open the LAST board — its pill would sit far off the right edge if nothing scrolled it into view.
    await page.goto(`/board/${lastId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-board-pill][data-active]");

    const track = page.locator("[data-boards-track]");
    // The track genuinely overflows (content wider than the box) and is flagged for the fade affordance.
    const metrics = await track.evaluate(el => ({
      scrollable: el.scrollWidth > el.clientWidth + 1,
      overflow: el.dataset.overflow !== undefined
    }));
    expect(metrics.scrollable).toBe(true);
    expect(metrics.overflow).toBe(true);

    // The active pill must be within the track's visible range (scrolled into view, not clipped).
    const visible = await page.evaluate(() => {
      const t = document.querySelector("[data-boards-track]");
      const a = document.querySelector("[data-board-pill][data-active]");
      if (!t || !a) return false;
      const tr = t.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      return ar.left >= tr.left - 1 && ar.right <= tr.right + 1;
    });
    expect(visible).toBe(true);
  });
});

test.describe("Board/department change transition", () => {
  test("the board content has an entry transition (animates on navigation)", async ({ page }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // The suite globally emulates prefers-reduced-motion (for stable visual baselines), which correctly
    // disables this transition — opt back into motion at runtime to assert the animation is actually wired.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // The animation lives on the CONTENT region, never the page wrapper (a transform on the wrapper would
    // trap the fixed issue overlay — see the overlay-covers-viewport guard below).
    const animation = await page
      .locator('[data-region="board"]')
      .evaluate(el => getComputedStyle(el).animationName);
    expect(animation).not.toBe("none");
    expect(animation).toContain("atlas-rise");
  });

  test("the open issue overlay covers the full viewport (not trapped in the board box)", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-title]");
    // The panel is position:fixed inset:0 — it MUST span ~the whole viewport. A lingering transform on
    // an ancestor (the content-transition bug) would make it the panel's containing block and shrink it
    // to the board box. This guards that regression.
    const box = await page.locator("[data-issue-panel]").boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(1280 * 0.95);
      expect(box.height).toBeGreaterThan(900 * 0.95);
    }
  });
});

test.describe("Human-readable incremental IDs (#14)", () => {
  test("a new issue gets a {n}-slug id derived from its title", async ({ page }) => {
    const res = await page.request.post("/api/boards/board-platform/columns/col-backlog/issues", {
      data: { title: "Refactor the WebSocket layer!" }
    });
    expect(res.ok()).toBeTruthy();
    const issue = (await res.json()) as { id: string };
    // {n}-slug, slug frozen from the title (punctuation stripped) — never an opaque UUID.
    expect(issue.id).toMatch(/^\d+-refactor-the-websocket-layer$/);
  });

  test("a new board gets a {n}-slug id derived from its title", async ({ page }) => {
    const res = await page.request.post("/api/boards", {
      data: { departmentId: "dept-eng", title: "Edge Caching" }
    });
    expect(res.ok()).toBeTruthy();
    const board = (await res.json()) as { id: string };
    expect(board.id).toMatch(/^\d+-edge-caching$/);
  });
});

test.describe("Deep-linkable attachment preview (#15)", () => {
  // A 1×1 transparent PNG — an inline-safe image so its chip renders as an image (gets the lightbox).
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  test("image preview is a shareable URL — opens on click, closes on Escape, reopens on deep-link", async ({
    page
  }) => {
    const id = await freshIssue(page, "Preview deeplink probe");
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    await page
      .locator("[data-attach-input]")
      .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
    await expect(page.locator("[data-attachment]")).toHaveCount(1, { timeout: 6000 });

    // Reload so the persisted attachment renders as its image chip (with the real content type).
    await page.goto(`/board/board-platform/issue/${id}`);
    await page.waitForLoadState("load");
    const chip = page.locator('[data-attachment][data-kind="image"]');
    await expect(chip).toHaveCount(1);
    const href = await chip.getAttribute("href");
    const attId = (href ?? "").split("/").pop() ?? "";
    // The attachment id is also a human-readable {n}-slug derived from the filename (#14).
    expect(attId).toMatch(/^\d+-shot-png$/);

    // Click → the lightbox opens AND the URL becomes the shareable attachment route.
    await chip.click();
    await expect(page.locator("[data-lightbox]")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/issue/${id}/attachment/${attId}$`));

    // Escape → the lightbox closes AND the URL restores to the issue route.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-lightbox]")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/issue/${id}$`));

    // Deep-link straight to the attachment URL → the preview opens on load.
    await page.goto(`/board/board-platform/issue/${id}/attachment/${attId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-lightbox]")).toBeVisible({ timeout: 6000 });
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
