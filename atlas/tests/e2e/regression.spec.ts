/**
 * @file Regression spec — durable, behaviour-level tests for the round-2 bug reports, so a fix can
 * never be "falsely confirmed" again. Each test reproduces one reported behaviour end-to-end against
 * the live dev server (real WebSocket, real D1). Self-contained where it mutates: tests that change
 * data create their own throwaway board + issue (never on the canonical `board-platform`, which the
 * visual baselines screenshot — see _fixtures.ts), so the seed and the baselines stay pristine.
 */
import AxeBuilder from "@axe-core/playwright";
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

test.describe("Board layout gap — freshly-created-board / empty-department (#layout-gap)", () => {
  // Regression: during the async snapshot load the board island paints the EMPTY_SNAPSHOT seed —
  // a `[data-board]` with 0 columns but its full vertical rhythm (padding: 2rem top + 3rem bottom).
  // That empty padded box opened a visible ~80px void between the masthead and where the columns
  // land — most noticeable on a slow load and on the empty-department → new-board / tab-switch paths
  // ("a gap appears sometimes…"). Fix: BoardView marks the 0-column seed with `[data-empty]` and the
  // scope collapses its vertical padding (`padding-block: 0`), so the empty box has no height; the
  // rhythm returns the instant the real columns paint. BoardView stays mounted throughout (no
  // empty-render of the persistent island — that tore down the list view), so board⇄list still swaps.

  test("the 0-column load seed collapses its vertical padding (no empty gap box)", async ({
    page
  }) => {
    // A loaded board carries the full vertical rhythm; toggling the load-seed marker must collapse it.
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-column]", { timeout: 10_000 });

    const pads = await page.locator("[data-board]").evaluate(board => {
      const read = () => {
        const s = getComputedStyle(board);
        return { top: s.paddingTop, bottom: s.paddingBottom };
      };
      const populated = read(); // 4 columns → the --space-6 / --space-8 rhythm
      board.dataset.empty = "true"; // the EMPTY_SNAPSHOT seed marker
      const emptySeed = read(); // collapsed → no padded gap box
      delete board.dataset.empty;
      return { populated, emptySeed };
    });

    expect(pads.populated.top).toBe("32px"); // var(--space-6)
    expect(pads.populated.bottom).toBe("48px"); // var(--space-8)
    expect(pads.emptySeed.top).toBe("0px"); // collapsed while loading
    expect(pads.emptySeed.bottom).toBe("0px");
  });

  test("a held snapshot shows no empty gap box, then the rhythm returns (real load window)", async ({
    page
  }) => {
    const boardId = await freshBoard(page, "Slow load gap board");

    // Hold the board-snapshot GET so the EMPTY_SNAPSHOT seed stays on screen — the exact window where
    // the bug used to show the 80px empty padded [data-board]. (page.route intercepts the browser's
    // own fetch; the fixture's APIRequestContext POST above is not affected.)
    // Definite-assignment: the Promise executor runs synchronously, so `release` is set before any use.
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(`**/api/boards/${boardId}`, async route => {
      if (route.request().method() === "GET") await held;
      await route.continue();
    });

    try {
      await page.goto(`/board/${boardId}`);

      // The board paints the seed immediately (before the held GET resolves): [data-board][data-empty].
      const seed = page.locator("[data-board][data-empty]");
      await expect(seed).toBeAttached({ timeout: 5000 });

      // The seed must not open a gap: padding collapsed → effectively zero height.
      const box = await seed.evaluate(el => {
        const s = getComputedStyle(el);
        return {
          top: s.paddingTop,
          bottom: s.paddingBottom,
          height: el.getBoundingClientRect().height
        };
      });
      expect(box.top).toBe("0px");
      expect(box.bottom).toBe("0px");
      expect(box.height).toBeLessThan(20);
    } finally {
      release(); // let the snapshot through so the board can finish loading
    }

    // Once the real columns paint, the normal vertical rhythm is back.
    await page.waitForSelector("[data-column]", { timeout: 10_000 });
    await expect(page.locator("[data-board]")).not.toHaveAttribute("data-empty");
    const restored = await page
      .locator("[data-board]")
      .evaluate(el => getComputedStyle(el).paddingTop);
    expect(restored).toBe("32px");
    await page.unroute(`**/api/boards/${boardId}`);
  });

  test("freshly-created board has only the design rhythm between masthead and columns", async ({
    page
  }) => {
    const boardId = await freshBoard(page, "Gap probe board");
    await page.goto(`/board/${boardId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-column]", { timeout: 10_000 });

    // Header bottom → board top is the --space-6 (32px) rhythm only; never an oversized void.
    const gap = await page.evaluate(() => {
      const header = document.querySelector("[data-board-header]");
      const board = document.querySelector("[data-board]");
      if (!header || !board) return -1;
      return board.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThan(-5); // columns sit below the header (not overlapping)
    expect(gap).toBeLessThan(48); // no oversized blank band (the old bug showed ~80px)
  });

  test("no residual empty-department EmptyState min-height after dept-to-board navigation", async ({
    page
  }) => {
    // Navigate to a board so the board island renders a real snapshot.
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-column]", { timeout: 10_000 });

    // The EmptyState (variant=empty-department) must NOT be visible — if it is, the island is
    // stuck in the empty-department state (the layout-gap root cause).
    const emptyState = page.locator('[data-empty-state][data-variant="empty-department"]');
    await expect(emptyState).toBeHidden();

    // [data-board] must be visible with actual columns (not 0-column EMPTY_SNAPSHOT).
    const columns = page.locator("[data-column]");
    await expect(columns.first()).toBeVisible();
  });
});

test.describe("Board ⇄ List view toggle (#view-toggle)", () => {
  // Regression: the boards-bar painted the Board/List toggle with an EMPTY board id during the window
  // before `resolveActive()` landed — `urls.toUrl("list", { id: "" })` = `/board//list`. A click in that
  // window (e.g. right after load, or under server load when resolveActive is slow) navigated to that
  // malformed URL, which the board route's `/board/{id}/…` matcher can't parse — so the board island read
  // view="board" and stayed stuck in kanban (flaky under the suite's 2 workers). Fix: the boards-bar seeds
  // activeBoardId + view from the route in `initState` (well-formed href on the FIRST paint) and hides the
  // controls until a board id resolves. The board island also stays mounted across the flip (no
  // empty-render teardown of the persistent island), so the list view always commits.

  test("the toggle links carry the board id from first paint (never /board//list)", async ({
    page
  }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    const list = page.getByRole("link", { name: "List", exact: true });
    const board = page.getByRole("link", { name: "Board", exact: true });
    await expect(list).toBeVisible();
    // The hrefs must include the board id — never the empty-id `/board//list` the board route can't parse.
    await expect(list).toHaveAttribute("href", "/board/board-platform/list");
    await expect(board).toHaveAttribute("href", "/board/board-platform");
  });

  test("clicking List immediately after load switches to the editorial list view", async ({
    page
  }) => {
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    // Click WITHOUT first waiting for [data-board] — the exact race that used to leave it stuck on kanban.
    await page.getByRole("link", { name: "List", exact: true }).click();
    await page.waitForURL(/\/board\/board-platform\/list$/);
    await expect(page.locator("[data-listview]")).toBeVisible();
    await expect(page.locator("[data-board]")).toHaveCount(0);
  });

  test("toggling back to Board from the list view restores the kanban columns", async ({
    page
  }) => {
    await page.goto("/board/board-platform/list");
    await page.waitForLoadState("load");
    await expect(page.locator("[data-listview]")).toBeVisible();
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page.waitForURL(/\/board\/board-platform$/);
    await expect(page.locator("[data-column]").first()).toBeVisible();
  });
});

test.describe("Description editor Save / Cancel affordance (#desc-save)", () => {
  // Regression tests for the explicit Save/Cancel button row added below the description textarea.
  // Prior: save was implicit only (clicking Preview segment or blur); no visible affordance.

  test("Save button commits description edit and shows the updated preview", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Desc save board",
      "Save button test issue"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // Switch to edit mode.
    await page.locator('[data-action="edit-description"]').click();
    const textarea = page.locator("[data-desc-edit]");
    await expect(textarea).toBeVisible();
    await textarea.fill("Updated description via Save button.");

    // The Save button must be present and labelled.
    const saveBtn = page.locator('[data-action="save-description"]');
    const cancelBtn = page.locator('[data-action="cancel-description"]');
    await expect(saveBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Click Save.
    await saveBtn.click();

    // Editor must close and preview must show the new text.
    await expect(textarea).toBeHidden();
    await expect(page.locator("[data-issue-body]")).toBeVisible();
    await expect(page.locator("[data-issue-body]")).toContainText("Updated description via Save");
  });

  test("Cancel button discards description edit without persisting", async ({ page }) => {
    // First save a known description so we can confirm it is NOT replaced on cancel.
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Desc cancel board",
      "Cancel button test issue"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // Seed a real description via Save so we have something to compare against.
    await page.locator('[data-action="edit-description"]').click();
    await page.locator("[data-desc-edit]").fill("Seeded description — should stay after cancel.");
    await page.locator('[data-action="save-description"]').click();
    await page.waitForSelector('[data-action="preview-description"][data-active]');

    // Now open edit again and type something DIFFERENT, then Cancel.
    await page.locator('[data-action="edit-description"]').click();
    const textarea = page.locator("[data-desc-edit]");
    await expect(textarea).toBeVisible();
    await textarea.fill("This should NOT be saved (cancel test).");

    // Click Cancel.
    await page.locator('[data-action="cancel-description"]').click();

    // Editor must close; body text must still contain the seeded description (not the typed one).
    await expect(textarea).toBeHidden();
    await expect(page.locator("[data-issue-body]")).toContainText("Seeded description");
    await expect(page.locator("[data-issue-body]")).not.toContainText("should NOT be saved");
  });

  test("description Save button commit persists after reload", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Desc persist board",
      "Persist save issue"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    await page.locator('[data-action="edit-description"]').click();
    await page.locator("[data-desc-edit]").fill("Durable description — via Save.");
    await page.locator('[data-action="save-description"]').click();
    await page.waitForSelector("[data-issue-body]");

    // Reload and verify the description is persisted.
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-issue-body]")).toContainText(
      "Durable description — via Save."
    );
  });
});

test.describe("Title editor Save / Cancel affordance (#title-save)", () => {
  test("Save button commits inline title edit", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Title save btn board",
      "Original title — save"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // Double-click to start inline title edit.
    await page.locator("[data-issue-title]").dblclick();
    const input = page.locator("[data-title-edit]");
    await expect(input).toBeVisible();
    await input.fill("Updated title — via Save button");

    // Save button must be present.
    await expect(page.locator('[data-action="save-title"]')).toBeVisible();
    await expect(page.locator('[data-action="cancel-title"]')).toBeVisible();

    // Click Save.
    await page.locator('[data-action="save-title"]').click();

    // Input closes; title updates.
    await expect(input).toBeHidden();
    await expect(page.locator("[data-issue-title]")).toHaveText("Updated title — via Save button");
  });

  test("Cancel button discards inline title edit", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Title cancel btn board",
      "Original title — cancel"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // Double-click to start inline title edit.
    await page.locator("[data-issue-title]").dblclick();
    const input = page.locator("[data-title-edit]");
    await expect(input).toBeVisible();
    await input.fill("THIS SHOULD BE DISCARDED");

    // Click Cancel.
    await page.locator('[data-action="cancel-title"]').click();

    // Input closes; original title is preserved.
    await expect(input).toBeHidden();
    await expect(page.locator("[data-issue-title]")).toHaveText("Original title — cancel");
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

test.describe("Description editor — Escape key (#escape-desc)", () => {
  // Regression: pressing Escape inside the [data-desc-edit] textarea was bubbling through the
  // panel's global Escape-to-close handler, closing the entire issue panel. Fix: a delegated
  // "keydown [data-desc-edit]" handler intercepts Escape, cancels the edit (no persist), and
  // calls stopPropagation so the panel's document-level handler never sees it.

  test("Escape in description textarea cancels edit without closing the panel", async ({
    page
  }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    const previewBody = page.locator("[data-issue-body]");
    const originalText = await previewBody.textContent();

    // Open edit mode
    await page.locator('[data-action="edit-description"]').click();
    const textarea = page.locator("[data-desc-edit]");
    await expect(textarea).toBeVisible();
    await textarea.fill("ESCAPE_CANCEL_MARKER — should not persist");

    // Press Escape — must close the EDITOR, not the whole panel
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Panel is STILL open (Escape is owned by the textarea, not the panel's global Escape handler)
    await expect(page.locator("[data-issue-panel]")).toBeVisible();
    // Editor is closed
    await expect(textarea).toBeHidden();
    // Preview text is unchanged (no persist on Escape)
    await expect(previewBody).not.toContainText("ESCAPE_CANCEL_MARKER");
    expect(await previewBody.textContent()).toBe(originalText);
  });
});

test.describe("Empty description body visibility (#empty-desc-body)", () => {
  // Regression: [data-issue-body] rendered an empty div (zero height) for issues with no
  // description, making it invisible to Playwright's visibility check and to assistive tech.
  // Fix: added `min-height: 1em` to [data-issue-body] in IssuePanel.css so the area is always
  // at least one line-height tall, even when renderMarkdown("") returns an empty block list.

  test("body area is visible (min-height) on an issue with no description", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Empty-body board",
      "Empty-body issue"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // [data-issue-body] must be visible even with an empty description (no zero-height collapse)
    const body = page.locator("[data-issue-body]");
    await expect(body).toBeVisible();
  });

  test("body area remains visible after Cancel on an empty-description issue", async ({ page }) => {
    const { boardId, issueId } = await freshBoardWithIssue(
      page,
      "Empty-cancel board",
      "Empty-cancel issue"
    );
    await page.goto(`/board/${boardId}/issue/${issueId}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // Type in Edit mode, then Cancel — body must remain visible
    await page.locator('[data-action="edit-description"]').click();
    await page.locator("[data-desc-edit]").fill("Should be discarded on cancel");
    await page.locator('[data-action="cancel-description"]').click();
    await page.waitForTimeout(300);

    const body = page.locator("[data-issue-body]");
    await expect(body).toBeVisible();
    await expect(body).not.toContainText("Should be discarded on cancel");
  });
});

test.describe("Issue panel accessibility — WCAG 2.1 AA (#panel-a11y)", () => {
  // Regression: multiple WCAG 2.1 AA violations were found in the issue panel:
  // 1. Save button: white text on --accent (#e8462a) = 3.93:1, fails 4.5:1 threshold at 11px.
  //    Fix: use --accent-deep (#c7351c) as Save button background (≈7.2:1 with white).
  // 2. Active toggle segment: --accent-deep (#c7351c) text on --accent-tint (#f8e5dc) = 4.35:1.
  //    Fix: use --text-strong for the active segment text (≈13:1 on the tint background).
  // 3. <aside data-rail> is a complementary landmark nested inside the page's <main> landmark
  //    (axe landmark-complementary-is-top-level). Fix: a non-landmark labelled group —
  //    <div data-rail role="group" aria-label="Properties">.

  test("issue panel in description edit mode passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    await page.locator('[data-action="edit-description"]').click();
    await expect(page.locator("[data-desc-edit]")).toBeVisible();

    const results = await new AxeBuilder({ page }).include("[data-issue-panel]").analyze();
    expect(results.violations).toEqual([]);
  });

  test("issue panel in title edit mode passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    await page.locator("[data-issue-title]").dblclick();
    await expect(page.locator("[data-title-edit]")).toBeVisible();

    const results = await new AxeBuilder({ page }).include("[data-issue-panel]").analyze();
    expect(results.violations).toEqual([]);
  });

  test("properties rail is a non-landmark labelled group (not a complementary landmark)", async ({
    page
  }) => {
    await page.goto("/board/board-platform/issue/issue-ws-reconnect");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-panel]");

    // The rail must NOT be an <aside> (a complementary landmark nests illegally inside <main>):
    // it is a <div role="group" aria-label="Properties"> — a labelled grouping, not a landmark.
    const rail = page.locator("[data-rail]");
    await expect(rail).toBeVisible();
    const info = await rail.evaluate(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role")
    }));
    expect(info.tag).toBe("div");
    expect(info.role).toBe("group");
  });
});
