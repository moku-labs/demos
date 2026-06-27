/**
 * @file Phone controller — deterministic final + reveal-flash tests + visual baselines.
 *
 * The live flow never reaches these phone screens (the host clock never advances past `question`), and
 * controller-rendering only covers the join wizard. These tests drive the REAL controller render with
 * frozen fixture state through the e2e harness — `/controller/<code>?e2ephase=<phase>` mounts a fixture
 * island (no room, no Hub) as the answerer "Mochi", so the final card and the correct reveal flash render
 * identically every run. Requires the harness build (TRIVIA_E2E=1, set by the Playwright webServer).
 */
import { expect, type Page, test } from "@playwright/test";

type PhoneKey = "final" | "reveal";

/** Navigate to a fixture phone screen and wait for the controller to render it (asserting the harness). */
async function gotoPhone(page: Page, phase: PhoneKey): Promise<void> {
  await page.goto(`/controller/TRIV1234?e2ephase=${phase}`);
  await page.waitForSelector(`[data-controller][data-phase='${phase}']`, { timeout: 20_000 });
  await expect(
    page.locator("html"),
    "E2E harness not active — start the dev server with TRIVIA_E2E=1 (the Playwright webServer sets it)"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Phone — final + reveal screens (deterministic fixtures)", () => {
  test("final (A15): medal, placement, score, two actions", async ({ page }) => {
    await gotoPhone(page, "final");
    await expect(page.locator("[data-component='phone-final']")).toBeVisible();
    await expect(page.locator("[data-final-place]")).toContainText("1st");
    await expect(page.locator("[data-final-score]")).toContainText("1,400");
    await expect(page.locator("[data-final-actions] button")).toHaveCount(2);
  });

  test("reveal flash (A13): correct wash with the points line", async ({ page }) => {
    await gotoPhone(page, "reveal");
    const flash = page.locator("[data-component='reveal-flash']");
    await expect(flash).toBeVisible();
    await expect(flash).toHaveAttribute("data-correct", "true");
    await expect(flash).toContainText("Correct!");
    await expect(flash).toContainText("+200");
  });
});

const PHONE_SCREENS: ReadonlyArray<{ phase: PhoneKey; shot: string }> = [
  { phase: "final", shot: "phone-final.png" },
  { phase: "reveal", shot: "phone-reveal-flash.png" }
];

test.describe("Phone — visual baselines", () => {
  for (const { phase, shot } of PHONE_SCREENS) {
    test(`${phase} matches visual baseline`, async ({ page }) => {
      await gotoPhone(page, phase);
      await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(shot, { fullPage: false, animations: "disabled" });
    });
  }
});
