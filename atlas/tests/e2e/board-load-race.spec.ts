/**
 * @file Regression — a slow EARLIER board load must never overwrite the board the URL now points at.
 *
 * The board island is persistent: navigating board ⇄ board re-runs `loadBoard` on the SAME instance
 * without unmounting. Without a load-generation guard (src/islands/board/lifecycle.ts), two overlapping
 * loads race on `ctx.set` — a slow first fetch can resolve LAST and repaint the board it no longer
 * points at, producing the random, route-mismatched "wrong board / wrong buttons" render.
 *
 * Made deterministic by delaying board A's snapshot response ~1.5s, then SPA-navigating A → B so B
 * (fast) paints first and A resolves late. The fix discards A's stale result; the board must show B.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";
import { backlogColumnId, freshBoard, freshIssueIn } from "./_fixtures";

test.describe("Board load — stale snapshot never wins the race", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("a slow earlier load does not overwrite the board the URL points at", async ({ page }) => {
    // Two throwaway boards, each with a uniquely-titled card so the rendered board is unmistakable.
    const slowBoard = await freshBoard(page, "Race Slow Alpha");
    const fastBoard = await freshBoard(page, "Race Fast Beta");
    await freshIssueIn(page, slowBoard, await backlogColumnId(page, slowBoard), "SLOW-ONLY-MARKER");
    await freshIssueIn(page, fastBoard, await backlogColumnId(page, fastBoard), "FAST-ONLY-MARKER");

    // Delay ONLY the slow board's snapshot fetch so it resolves after the fast board's.
    await page.route(`**/api/boards/${slowBoard}`, async route => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.continue();
    });

    // Mount the island on the slow board (its snapshot is now in-flight, delayed)...
    await page.goto(`/board/${slowBoard}`);
    await page.waitForLoadState("load");

    // ...then immediately SPA-navigate to the fast board (same persistent island → overlapping load).
    await page.evaluate(id => {
      const anchor = document.createElement("a");
      anchor.href = `/board/${id}`;
      // appendChild (not append): @cloudflare/workers-types merges a conflicting append overload in
      // this project (see src/islands/board/handlers.ts). The anchor must be in the DOM so the SPA's
      // document-level click interceptor catches the navigation.
      // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }, fastBoard);

    // The fast board paints first.
    await page.waitForURL(url => url.pathname === `/board/${fastBoard}`);
    await expect(page.getByText("FAST-ONLY-MARKER")).toBeVisible();

    // Wait past the slow board's delay so its (now stale) response resolves — it must be discarded.
    await page.waitForTimeout(2000);

    await expect(page.getByText("FAST-ONLY-MARKER")).toBeVisible();
    await expect(page.getByText("SLOW-ONLY-MARKER")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/board/${fastBoard}`);
  });
});
