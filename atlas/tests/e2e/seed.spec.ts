/**
 * @file Seed — the authenticated starting point the Playwright planner/generator agents build
 * scenarios from (`npx playwright init-agents`). Signs in with the demo credentials and lands on the
 * home board, so generated tests start from a real, logged-in Atlas session.
 */
import { test } from "@playwright/test";
import { signIn } from "./_auth";

test.describe("seed", () => {
  test("authenticated board", async ({ page }) => {
    await signIn(page);
    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");
  });
});
