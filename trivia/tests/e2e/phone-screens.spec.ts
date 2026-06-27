/**
 * @file Phone controller — deterministic phase-screen tests + visual baselines.
 *
 * The live flow never reaches post-lobby phone screens in tests; the harness closes that gap by
 * driving the REAL controller render with frozen fixture state through the e2e harness —
 * `/controller/<code>?e2ephase=<phase>` mounts a fixture island (no room, no Hub) as a specific
 * player so each screen renders identically every run.
 *
 * Requires the harness build (TRIVIA_E2E=1, set by the Playwright webServer).
 *
 * ## Design coverage (spec/design-context.md §6)
 * - A9 join wizard (existing in controller-rendering.spec.ts — not duplicated here)
 * - A10 waiting room, A11 phone category pick, A12 answer grid (+ locked state),
 *   A13 reveal flash correct, A14 reveal flash wrong, A15 final card,
 *   E1 leave modal, E2 mid-join modal.
 *
 * ## Viewport
 * This spec runs on `phone-chromium` (390×844) and `phone-webkit` (390×844 visual only).
 * Previous baselines were wrongly captured at 1280×720 — they have been removed and replaced
 * by correct 390×844 captures.
 */
import { expect, type Page, test } from "@playwright/test";
import type { PhonePhaseKey } from "./harness/fixtures";

/** The controller `data-phase` for each harness phone phase key. */
const CONTROLLER_PHASE: Record<PhonePhaseKey, string> = {
  final: "final",
  reveal: "reveal",
  revealWrong: "reveal",
  waiting: "lobby",
  categoryPick: "categoryPick",
  answer: "question",
  answerLocked: "question",
  leaveModal: "question",
  midJoin: "question"
};

/** Navigate to a fixture phone screen and wait for the controller to render it. */
async function gotoPhone(page: Page, phase: PhonePhaseKey): Promise<void> {
  await page.goto(`/controller/TRIV1234?e2ephase=${phase}`);
  await page.waitForSelector(`[data-controller][data-phase='${CONTROLLER_PHASE[phase]}']`, {
    timeout: 20_000
  });
  await expect(
    page.locator("html"),
    "E2E harness not active — start the dev server with TRIVIA_E2E=1"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

/** Freeze the clock + collapse motion + settle for visual determinism. */
async function settleForShot(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(500);
}

// ─── Functional assertions ────────────────────────────────────────────────────────────

test.describe("Phone — waiting room (A10)", () => {
  test("joined non-host player sees waiting card with name and room info", async ({ page }) => {
    await gotoPhone(page, "waiting");
    // Pixel (p2) is not host — sees waiting card
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-wait-hint]")).toBeVisible();
  });
});

test.describe("Phone — category pick (A11)", () => {
  test("active player sees 6 category buttons", async ({ page }) => {
    await gotoPhone(page, "categoryPick");
    await expect(page.locator("[data-component='phone-category']")).toBeVisible();
    // CategoryButton uses data-component="category-button"
    await expect(page.locator("[data-component='category-button']")).toHaveCount(6);
    // Header shows active player's name
    await expect(page.locator("[data-phone-title]")).toContainText("Mochi");
  });
});

test.describe("Phone — answer grid (A12)", () => {
  test("answering player sees 4 answer buttons before locking", async ({ page }) => {
    await gotoPhone(page, "answer");
    await expect(page.locator("[data-component='phone-answer']")).toBeVisible();
    // AnswerButton uses data-component="answer-button"
    await expect(page.locator("[data-component='answer-button']")).toHaveCount(4);
    // All buttons in idle state before locking
    await expect(page.locator("[data-component='answer-button'][data-state='idle']")).toHaveCount(
      4
    );
  });

  test("locked-in state shows one locked button and dim others", async ({ page }) => {
    await gotoPhone(page, "answerLocked");
    await expect(page.locator("[data-component='phone-answer']")).toBeVisible();
    // Slot 2 (C / Saturn) is locked; other 3 are dim
    await expect(page.locator("[data-component='answer-button'][data-state='locked']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-component='answer-button'][data-state='dim']")).toHaveCount(3);
  });
});

test.describe("Phone — final + reveal screens (deterministic fixtures)", () => {
  test("final (A15): medal, placement, score, two actions", async ({ page }) => {
    await gotoPhone(page, "final");
    await expect(page.locator("[data-component='phone-final']")).toBeVisible();
    await expect(page.locator("[data-final-place]")).toContainText("1st");
    await expect(page.locator("[data-final-score]")).toContainText("1,400");
    await expect(page.locator("[data-final-actions] button")).toHaveCount(2);
    // A15: the muted stat sub-line (top category + best streak, synced from the host per-player).
    await expect(page.locator("[data-final-stats]")).toContainText("Top category");
    await expect(page.locator("[data-final-stats]")).toContainText("Best streak");
  });

  test("reveal flash correct (A13): bright green wash, points line", async ({ page }) => {
    await gotoPhone(page, "reveal");
    const flash = page.locator("[data-component='reveal-flash']");
    await expect(flash).toBeVisible();
    await expect(flash).toHaveAttribute("data-correct", "true");
    await expect(flash).toContainText("Correct!");
    await expect(flash).toContainText("+200");
  });

  test("reveal flash wrong (A14): wrong state flash shown", async ({ page }) => {
    await gotoPhone(page, "revealWrong");
    const flash = page.locator("[data-component='reveal-flash']");
    await expect(flash).toBeVisible();
    // Wrong reveal: data-correct must be "false" (not "true")
    const correct = await flash.getAttribute("data-correct");
    expect(correct).not.toBe("true");
  });
});

test.describe("Phone — leave modal (E1)", () => {
  test("leave modal shows 'Leave the game?' with Stay + Leave buttons", async ({ page }) => {
    await gotoPhone(page, "leaveModal");
    const modal = page.locator("[data-component='leave-modal']");
    await expect(modal).toBeVisible();
    // Title text
    await expect(modal.locator("[data-title]")).toContainText("Leave");
    // Two action buttons inside data-actions
    await expect(modal.locator("[data-actions] button")).toHaveCount(2);
    // Stay button (ghost)
    await expect(modal.locator("button[data-btn='ghost']")).toBeVisible();
    // Leave button (coral)
    await expect(modal.locator("button[data-btn='coral']")).toBeVisible();
  });
});

test.describe("Phone — mid-join modal (E2)", () => {
  test("mid-join modal shows 'Game in progress' message", async ({ page }) => {
    await gotoPhone(page, "midJoin");
    const modal = page.locator("[data-component='mid-join-modal']");
    await expect(modal).toBeVisible();
    await expect(modal.locator("[data-title]")).toContainText("Game in progress");
    await expect(modal.locator("button[data-btn='sky']")).toBeVisible();
  });
});

// ─── Visual baselines (all at 390×844 — phone-chromium + phone-webkit projects) ──────

const PHONE_SCREENS: ReadonlyArray<{ phase: PhonePhaseKey; shot: string }> = [
  { phase: "waiting", shot: "phone-waiting.png" },
  { phase: "categoryPick", shot: "phone-category.png" },
  { phase: "answer", shot: "phone-answer.png" },
  { phase: "answerLocked", shot: "phone-answer-locked.png" },
  { phase: "reveal", shot: "phone-reveal-flash.png" },
  { phase: "revealWrong", shot: "phone-reveal-wrong.png" },
  { phase: "final", shot: "phone-final.png" },
  { phase: "leaveModal", shot: "phone-leave-modal.png" },
  { phase: "midJoin", shot: "phone-mid-join.png" }
];

test.describe("Phone — visual baselines (390×844)", () => {
  for (const { phase, shot } of PHONE_SCREENS) {
    test(`${phase} matches visual baseline`, async ({ page }) => {
      await gotoPhone(page, phase);
      await settleForShot(page);
      await expect(page).toHaveScreenshot(shot, { fullPage: false, animations: "disabled" });
    });
  }
});
