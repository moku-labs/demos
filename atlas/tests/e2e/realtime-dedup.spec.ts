/**
 * @file Priority-zero regression guard: the realtime reconcile must DEDUPE — creating a card or a column
 * after navigating between boards yields EXACTLY ONE, never N copies.
 *
 * The bug: the board island is persistent (it lives in the chrome and never unmounts), but it registered
 * its realtime `onPatch` handler per-`loadBoard` via `ctx.cleanup` — which only fires on unmount. So
 * every SPA board switch leaked another handler, and ONE `issue.created` / `column.created` broadcast
 * reconciled N times → N duplicate cards, or N duplicate columns sharing an id (broken Preact keys + a
 * misplaced "Add column"). A reload re-fetched the server's true state (one), masking it. The fix
 * registers the handler ONCE on mount and dedupes `issue.created` / `column.created` by id.
 *
 * This guard reproduces the leak path: it SPA-navigates several boards (clicking pills — NOT `page.goto`,
 * which resets the module state and hides the leak) BEFORE creating, then asserts a single element. The
 * work happens on throwaway Engineering boards so `board-platform` stays pristine for the baselines.
 */
import { expect, type Page, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";
import { freshBoard } from "./_fixtures";

/**
 * SPA-navigate between two boards four times (the handler-leak path), landing on `boardA`.
 *
 * @param page - The Playwright page.
 * @param boardA - The board to start and finish on.
 * @param boardB - The other board to bounce through.
 */
async function bounceBetweenBoards(page: Page, boardA: string, boardB: string): Promise<void> {
  await page.goto(`/board/${boardA}`); // hard load → fresh module state (ONE patch handler)
  await page.waitForLoadState("load");
  await page.waitForSelector("[data-board] [data-column]");

  // Each pill click is a real SPA nav (one more board load → one more leaked handler on the old code).
  // The pill is a <div>; the link carrying the href is its child `[data-board-link]` anchor.
  for (const id of [boardB, boardA, boardB, boardA]) {
    await page.locator(`a[data-board-link][href="/board/${id}"]`).click();
    await page.waitForURL(new RegExp(`/board/${id}$`));
    await page.waitForSelector("[data-board] [data-column]");
  }
}

test.describe("Realtime reconcile dedup — no duplicates after board navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("creating a card after SPA-navigating boards yields exactly ONE card", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));

    const a = await freshBoard(page, "Dedup card A");
    const b = await freshBoard(page, "Dedup card B");
    await bounceBetweenBoards(page, a, b);

    // Add a card via the real "Add card" UI on the current board's first column.
    await page.locator("[data-column]").first().locator("[data-add-card]").click();
    const modal = page.locator("[data-modal]");
    await expect(modal).toBeVisible();
    await modal.locator("input, textarea").first().fill("Dedup probe card");
    await modal.getByRole("button", { name: "Add", exact: true }).click();

    // EXACTLY ONE card — was N (the number of board loads) before the fix.
    const card = page.locator("[data-card-title]", { hasText: "Dedup probe card" });
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(800); // let any straggling broadcast settle
    await expect(card).toHaveCount(1);

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("creating a column after SPA-navigating boards yields exactly ONE column (grid intact)", async ({
    page
  }) => {
    const a = await freshBoard(page, "Dedup col A");
    const b = await freshBoard(page, "Dedup col B");
    await bounceBetweenBoards(page, a, b);

    await page.locator("[data-board-foot] [data-add-column]").click();
    const modal = page.locator("[data-modal]");
    await expect(modal).toBeVisible();
    await modal.locator("input, textarea").first().fill("QA gate");
    await modal.getByRole("button", { name: "Add", exact: true }).click();

    // EXACTLY ONE "QA gate" column — was N duplicate same-id columns before the fix.
    await expect(page.locator('[data-column][aria-label="QA gate"]')).toHaveCount(1);
    await page.waitForTimeout(800);
    await expect(page.locator('[data-column][aria-label="QA gate"]')).toHaveCount(1);

    // Grid integrity: the inline `--column-count` matches the rendered column count, and every column
    // sits on ONE row (equal tops) — a duplicate column would mismatch the count var and wrap the grid
    // onto a second row (the symptom from the screenshots).
    const layout = await page.locator("[data-board]").evaluate((el: HTMLElement) => {
      const cols = [...el.querySelectorAll<HTMLElement>("[data-column]")];
      const countVar = Number(getComputedStyle(el).getPropertyValue("--column-count").trim());
      const tops = cols.map(col => Math.round(col.getBoundingClientRect().top));
      const singleRow = tops.every(top => top === tops[0]);
      return { cols: cols.length, countVar, singleRow };
    });
    expect(layout.countVar).toBe(layout.cols);
    expect(layout.singleRow).toBe(true);
  });
});
