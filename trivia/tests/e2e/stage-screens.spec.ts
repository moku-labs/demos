/**
 * @file TV stage — deterministic phase-screen tests + visual baselines (the post-question gap).
 *
 * The live two-context flow (00-two-context-flow) stops at the `question` phase: the host clock drives
 * the later phases and `match.phase` is never advanced to `reveal` on an answer-lock, so a live test can
 * never reach reveal / steal / scoreboard / podium. These tests close that gap by driving the REAL stage
 * render with frozen fixture state through the e2e harness — `/?e2ephase=<phase>` mounts a fixture island
 * (no room, no Hub WebSocket) so each screen renders byte-identically every run.
 *
 * Requires the harness build (TRIVIA_E2E=1, set by the Playwright webServer). `gotoStage` asserts the
 * harness marker so a reused non-harness dev server fails loudly instead of timing out mysteriously.
 */
import { expect, type Page, test } from "@playwright/test";

/** The stage `data-phase` for each harness phase key (`steal` is a sub-state of the `question` phase). */
const MATCH_PHASE = {
  question: "question",
  steal: "question",
  reveal: "reveal",
  scoreboard: "scoreboard",
  final: "final"
} as const;

type PhaseKey = keyof typeof MATCH_PHASE;

/** Navigate to a fixture phase screen and wait for the stage to render it (asserting the harness is on). */
async function gotoStage(page: Page, phase: PhaseKey): Promise<void> {
  await page.goto(`/?e2ephase=${phase}`);
  await page.waitForSelector(`[data-stage][data-phase='${MATCH_PHASE[phase]}']`, {
    timeout: 20_000
  });
  await expect(
    page.locator("html"),
    "E2E harness not active — start the dev server with TRIVIA_E2E=1 (the Playwright webServer sets it)"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

/** Freeze the clock + collapse motion + settle, matching the lobby baseline's determinism setup. */
async function settleForShot(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(500);
}

test.describe("TV Stage — phase screens render (deterministic fixtures)", () => {
  test("question (A4): prompt + 4-tile answer grid + timer ring", async ({ page }) => {
    await gotoStage(page, "question");
    await expect(
      page.locator("[data-component='stage-question'][data-screen='question']")
    ).toBeVisible();
    await expect(page.locator("[data-answer-grid] [data-component='answer-tile']")).toHaveCount(4);
    await expect(page.locator("[data-timer]")).toBeVisible();
    await expect(page.locator("[data-prompt]")).toContainText("moons");
  });

  test("steal (F1): the steal strip names the next player", async ({ page }) => {
    await gotoStage(page, "steal");
    const strip = page.locator("[data-steal-strip]");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Pixel");
    await expect(strip).toContainText("steal");
  });

  test("reveal (A6): correct tile tagged, answer line, score rollup", async ({ page }) => {
    await gotoStage(page, "reveal");
    const correctTile = page.locator("[data-component='answer-tile'][data-state='correct']");
    await expect(correctTile).toHaveCount(1);
    await expect(correctTile.locator("[data-tag]")).toContainText("CORRECT");
    await expect(page.locator("[data-answer-line]")).toContainText("Saturn");
    await expect(page.locator("[data-score-rollup]")).toBeVisible();
  });

  test("scoreboard (A7): titled standings, one tile per player", async ({ page }) => {
    await gotoStage(page, "scoreboard");
    await expect(page.locator("[data-component='stage-scoreboard'] [data-title]")).toContainText(
      "Standings after Round 6"
    );
    await expect(page.locator("[data-component='scoreboard-tile']")).toHaveCount(5);
  });

  test("final (A8): 3 podium blocks, confetti, also-rans, stat line", async ({ page }) => {
    await gotoStage(page, "final");
    await expect(page.locator("[data-component='stage-podium']")).toBeVisible();
    await expect(page.locator("[data-podium-stage] [data-component='podium-block']")).toHaveCount(
      3
    );
    await expect(page.locator("[data-component='confetti']")).toBeAttached();
    await expect(page.locator("[data-also-ran]")).toHaveCount(2);
    await expect(page.locator("[data-stat-line]")).toContainText("Most steals");
  });
});

const SCREENS: ReadonlyArray<{ phase: PhaseKey; shot: string }> = [
  { phase: "question", shot: "tv-question.png" },
  { phase: "steal", shot: "tv-steal.png" },
  { phase: "reveal", shot: "tv-reveal.png" },
  { phase: "scoreboard", shot: "tv-scoreboard.png" },
  { phase: "final", shot: "tv-podium.png" }
];

test.describe("TV Stage — phase screen visual baselines", () => {
  for (const { phase, shot } of SCREENS) {
    test(`${phase} matches visual baseline`, async ({ page }) => {
      await gotoStage(page, phase);
      await settleForShot(page);
      await expect(page).toHaveScreenshot(shot, { fullPage: false, animations: "disabled" });
    });
  }
});
