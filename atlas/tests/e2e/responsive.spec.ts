/**
 * @file Responsive spec — guards the app against horizontal-overflow layout breakage across a wide
 * range of viewport widths (not hand-picked breakpoints). The body/document must never scroll
 * horizontally at any width — only designated inner scrollers (the kanban column track) may. A failure
 * here means some element escapes its container at that width, which is the canonical "broken
 * responsive" symptom (#1). Each screen is checked from very small phones up to large desktops.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "./_auth";

/** Representative widths from small phones → large desktop (continuous, not just design breakpoints). */
const WIDTHS = [320, 360, 390, 414, 600, 768, 900, 1024, 1280, 1440, 1680];

/** A seed issue that always exists (for the issue-overlay screen). */
const SEED_ISSUE = "issue-ws-reconnect";

/** Measure document-level horizontal overflow (scrollWidth beyond the viewport), in px. */
async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - window.innerWidth);
  });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const width of WIDTHS) {
  test(`board has no horizontal body overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-page='board']");
    // ≤2px tolerance for sub-pixel rounding; the kanban track scrolls internally and must not count.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
  });

  test(`issue overlay has no horizontal body overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/board/board-platform/issue/${SEED_ISSUE}`);
    await page.waitForLoadState("load");
    await page.waitForSelector("[data-issue-title]");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
  });
}

test("list view has no horizontal body overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/board/board-platform/list");
  await page.waitForLoadState("load");
  await page.waitForSelector("[data-page='board']");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
});

test("signin has no horizontal body overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/signin");
  await page.waitForLoadState("load");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
});
