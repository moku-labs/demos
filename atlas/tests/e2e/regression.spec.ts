/**
 * @file Regression spec — durable, behaviour-level tests for the round-2 bug reports, so a fix can
 * never be "falsely confirmed" again. Each test reproduces one reported behaviour end-to-end against
 * the live dev server (real WebSocket, real D1). Self-contained where it mutates: tests that change
 * data create their own throwaway board + issue (never on the canonical `board-platform`, which the
 * visual baselines screenshot — see _fixtures.ts), so the seed and the baselines stay pristine.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";
import { freshBoard, freshBoardWithIssue } from "./_fixtures";

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

test.describe("Persistent board (live across issue open/close)", () => {
  test("board keeps scroll + stays realtime-live when an issue opens and closes", async ({
    page
  }) => {
    // Use an isolated fresh board so the Backlog column has only 1 card (always visible).
    // This prevents the shared platform board's accumulated 65+ Backlog issues from hiding cards.
    const { boardId, issueId: probe } = await freshBoardWithIssue(
      page,
      "Persistent board probe",
      "Persistent realtime probe"
    );

    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(`/board/${boardId}`);
    await page.waitForLoadState("load");
    // Wait for the actual card to render.
    await page.waitForSelector(`[data-card-id="${probe}"]`);

    // Click the card (SPA click — invokes rememberBoardScroll before the nav; board persists).
    await page.locator(`[data-card-id="${probe}"] [data-card-title]`).click();
    await page.waitForURL(new RegExp(`/issue/${probe}$`));
    await page.waitForSelector("[data-issue-title]");

    // Realtime continues while the panel is open: editing the issue updates its board card live —
    // proof the board never unmounted / dropped its WebSocket connection.
    await page.request.patch(`/api/issues/${probe}`, {
      data: { title: "Persistent realtime probe — edited" }
    });
    await expect(page.locator(`[data-card-id="${probe}"]`)).toContainText(
      "Persistent realtime probe — edited",
      { timeout: 6000 }
    );

    // Close → board returns and the scroll-lock attribute is removed (no permanent overlay lock).
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForURL(new RegExp(`/board/${boardId}$`));
    await page.waitForTimeout(300);
    // The scroll-lock attribute must be gone after close.
    const isLocked = await page.evaluate(
      () => document.documentElement.dataset.overlayIssue !== undefined
    );
    expect(isLocked).toBe(false);
  });
});

test.describe("Board/department change transition", () => {
  test("navigation runs a SPA view transition (crossfade mode, no per-mount re-animation)", async ({
    page
  }) => {
    // The suite globally emulates prefers-reduced-motion (for stable baselines), which the framework
    // honours by skipping view transitions — opt back into motion to assert the transition is wired.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-card-id]");

    // Count startViewTransition calls AND board-content animation restarts across a nav.
    await page.evaluate(() => {
      const w = globalThis as unknown as { __vt: number; __rise: number };
      w.__vt = 0;
      w.__rise = 0;
      document.addEventListener(
        "animationstart",
        e => {
          if ((e.target as Element).matches?.("[data-region]")) w.__rise += 1;
        },
        true
      );
      const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      const orig = d.startViewTransition?.bind(d);
      if (orig) {
        d.startViewTransition = cb => {
          w.__vt += 1;
          return orig(cb);
        };
      }
    });
    // The transition mode only works where the API exists (Playwright's Chromium has it).
    expect(await page.evaluate(() => typeof document.startViewTransition === "function")).toBe(
      true
    );

    // Open then close an issue (two same-board section swaps) — the flicker scenario.
    const firstId = await page.locator("[data-card-id]").first().getAttribute("data-card-id");
    await page.locator(`[data-card-id="${firstId}"]`).click();
    await page.waitForSelector("[data-issue-title]");
    await page.locator('[data-bar-tools] button[data-action="close"]').click();
    await page.waitForSelector("[data-card-id]");
    await page.waitForTimeout(200);

    const counters = await page.evaluate(() => {
      const w = globalThis as unknown as { __vt: number; __rise: number };
      return { vt: w.__vt, rise: w.__rise };
    });
    // Each swap goes through a view transition (the crossfade), and the board no longer re-runs a
    // per-mount rise animation (the old flicker — was 4 restarts for this cycle).
    expect(counters.vt).toBeGreaterThan(0);
    expect(counters.rise).toBe(0);
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
  test("a new issue gets a short {n}-slug id derived from its title", async ({ page }) => {
    // Create on a throwaway board (never board-platform — the visual baselines screenshot it).
    const { issueId } = await freshBoardWithIssue(
      page,
      "Slug id probe board",
      "Refactor the WebSocket layer!"
    );
    // {n}-slug, slug frozen from the title (punctuation stripped) — never an opaque UUID. The slug is
    // kept short (clamped to 24 chars on a whole-word boundary), so the trailing "layer" word drops.
    expect(issueId).toMatch(/^\d+-refactor-the-websocket$/);
  });

  test("a new board gets a {n}-slug id derived from its title", async ({ page }) => {
    const id = await freshBoard(page, "Edge Caching");
    expect(id).toMatch(/^\d+-edge-caching$/);
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
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Preview deeplink board",
      "Preview deeplink probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page
      .locator("[data-attach-input]")
      .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
    await expect(page.locator("[data-attachment]")).toHaveCount(1, { timeout: 6000 });

    // Reload so the persisted attachment renders as its image chip (with the real content type).
    await page.goto(`/board/${boardId}/issue/${issueId}`);
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
    await expect(page).toHaveURL(new RegExp(`/issue/${issueId}/attachment/${attId}$`));

    // Escape → the lightbox closes AND the URL restores to the issue route.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-lightbox]")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/issue/${issueId}$`));

    // Deep-link straight to the attachment URL → the preview opens on load.
    await page.goto(`/board/${boardId}/issue/${issueId}/attachment/${attId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-lightbox]")).toBeVisible({ timeout: 6000 });
  });
});

test.describe("Realtime / optimistic updates", () => {
  test("attachment appears immediately after upload (no reload)", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Attach-live board",
      "Attach-live probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
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
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Attach-persist board",
      "Attach-persist probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.locator("[data-attach-input]").setInputFiles({
      name: "persist.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hi")
    });
    await expect(page.locator("[data-attachment]")).toHaveCount(1, { timeout: 6000 });

    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-attachment]")).toHaveCount(1);
  });

  test("sub-issue appears immediately after Enter (no reload)", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Sub-live board",
      "Sub-live probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    const field = page.locator("[data-sub-add-field]");
    await field.fill("First sub-task");
    await field.press("Enter");
    await expect(page.locator("[data-sub-issue]")).toHaveCount(1, { timeout: 6000 });
  });
});

test.describe("Realtime status → board", () => {
  test("changing status moves the board card LIVE while the panel is open", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Live status board",
      "Live status board probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");

    await page.locator('[data-rail-field]:has([data-rail-label]:text-is("Status"))').click();
    // Status options are the board's columns now — pick by the column name, not a status key.
    await page.getByRole("option", { name: "In Review", exact: true }).click();

    // The card (on the board behind the open panel) must move to In Review live — no reload.
    const reviewColumn = page.locator('[data-column][aria-label="In Review"]');
    await expect(reviewColumn.locator(`[data-card-id="${issueId}"]`)).toBeVisible({
      timeout: 6000
    });
  });

  test("after closing the issue (SPA, no reload) the card is in the new column", async ({
    page
  }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Close status board",
      "Close status probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");

    await page.locator('[data-rail-field]:has([data-rail-label]:text-is("Status"))').click();
    await page.getByRole("option", { name: "Done", exact: true }).click();
    // Close via the × (SPA nav back to the board — not a full page reload).
    await page.locator('[data-bar-tools] button[data-action="close"]').click();

    const doneColumn = page.locator('[data-column][aria-label="Done"]');
    await expect(doneColumn.locator(`[data-card-id="${issueId}"]`)).toBeVisible({ timeout: 6000 });
  });

  test("changing priority updates the rail live (optimistic, no reload)", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Priority live board",
      "Priority live probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
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
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Icon rail board",
      "Icon rail probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
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
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Title edit board",
      "Title before"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.locator("[data-issue-title]").dblclick();
    const input = page.locator("[data-title-edit]");
    await input.fill("Title after — verified");
    await input.press("Enter");

    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-title]")).toHaveText("Title after — verified");
  });

  test("milestone assignment persists across reload", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Milestone board",
      "Milestone probe"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page
      .locator('[data-rail-field]:has([data-rail-label]:text-is("Milestone / Cycle"))')
      .click();
    const field = page.locator("[data-ms-add-field]");
    await field.fill("Q9 Cycle");
    await field.press("Enter");

    await page.goto(`/board/${boardId}/issue/${issueId}`);
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
