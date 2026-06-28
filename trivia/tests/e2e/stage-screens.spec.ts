/**
 * @file TV stage — deterministic phase-screen tests + visual baselines.
 *
 * The live two-context flow (00-two-context-flow) stops at the `question` phase. These tests close
 * the gap by driving the REAL stage render with frozen fixture state through the e2e harness —
 * `/?e2ephase=<phase>` mounts a fixture island (no room, no Hub WebSocket) so each screen renders
 * byte-identically every run.
 *
 * Requires the harness build (TRIVIA_E2E=1, set by the Playwright webServer). `gotoStage` asserts the
 * harness marker so a reused non-harness dev server fails loudly instead of timing out mysteriously.
 *
 * ## Design coverage (spec/design-context.md §6)
 * - A1 lobby, A2 language pick, A3 category pick, A4 question, A5 (question with steal strip),
 *   A6 reveal, A7 scoreboard, A8 podium, C1 round intro overlay.
 */
import { expect, type Page, test } from "@playwright/test";
import type { StagePhaseKey } from "./harness/fixtures";

/** The stage `data-phase` for each harness phase key. */
const MATCH_PHASE: Record<StagePhaseKey, string> = {
  question: "question",
  steal: "question",
  reveal: "reveal",
  scoreboard: "scoreboard",
  final: "final",
  lobby: "lobby",
  languageVote: "languageVote",
  categoryPick: "categoryPick",
  // categoryReveal: TV shows StageCategory with data-phase="categoryReveal"
  categoryReveal: "categoryReveal",
  // categoryLoading: picker open but bank still loading — renders the categoryPick screen
  categoryLoading: "categoryPick",
  roundIntro: "roundIntro",
  // Question variants
  questionRu: "question",
  questionFlag: "question",
  // Reveal variants
  revealWrongSteal: "reveal",
  revealTimeout: "reveal",
  revealStolen: "reveal",
  // Overlay phases — base phase is the underlying screen
  pauseOverlay: "question",
  disconnectBanner: "lobby",
  categoryExhausted: "categoryPick",
  reconnectStrip: "question",
  endCountdown: "final"
};

/** Navigate to a fixture phase screen and wait for the stage to render it. */
async function gotoStage(page: Page, phase: StagePhaseKey): Promise<void> {
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

/** Freeze the clock + collapse motion + settle for visual determinism. */
async function settleForShot(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(500);
}

// ─── Functional assertions ────────────────────────────────────────────────────────────

test.describe("TV Stage — lobby (A1)", () => {
  test("renders top bar, room code, QR block, player grid", async ({ page }) => {
    await gotoStage(page, "lobby");
    await expect(page.locator("[data-region='top-bar']")).toBeVisible();
    await expect(page.locator("[data-badge]")).toContainText("Lobby");
    await expect(page.locator("[data-component='stage-lobby']")).toBeVisible();
    await expect(page.locator("[data-lobby-join]")).toBeVisible();
    await expect(page.locator("[data-lobby-players]")).toBeVisible();
    // Fixture: 3 players joined (player-tile components, excluding empty slots)
    await expect(page.locator("[data-component='player-tile']:not([data-empty])")).toHaveCount(3);
  });
});

test.describe("TV Stage — language pick (A2)", () => {
  test("renders two language cards with voter counts", async ({ page }) => {
    await gotoStage(page, "languageVote");
    await expect(page.locator("[data-component='stage-language']")).toBeVisible();
    // Two language option cards (data-component="language-card")
    await expect(page.locator("[data-component='language-card']")).toHaveCount(2);
    // Live tally line is visible (data-tally)
    await expect(page.locator("[data-tally]")).toBeVisible();
    // English leads (3 voters vs 2)
    await expect(
      page.locator("[data-component='language-card'][data-lang='en'][data-leading='true']")
    ).toBeVisible();
  });
});

test.describe("TV Stage — category pick (A3)", () => {
  test("renders 6 category cards in the picker grid", async ({ page }) => {
    await gotoStage(page, "categoryPick");
    await expect(page.locator("[data-component='stage-category']")).toBeVisible();
    // Category cards use data-component="category-card"
    await expect(page.locator("[data-component='category-card']")).toHaveCount(6);
    // Active player chooser row uses data-chooser
    await expect(page.locator("[data-chooser]")).toBeVisible();
    await expect(page.locator("[data-who]")).toContainText("Mochi");
  });
});

test.describe("TV Stage — category reveal beat (A3 → F3)", () => {
  test("chosen card glows, others fade, F3 banner drops in, chooser row hidden", async ({
    page
  }) => {
    await gotoStage(page, "categoryReveal");
    const root = page.locator("[data-component='stage-category']");
    await expect(root).toBeVisible();
    // Root element marks the revealing state
    await expect(root).toHaveAttribute("data-revealing", "true");
    // Chooser row is hidden during the reveal beat (design A3)
    await expect(page.locator("[data-chooser]")).not.toBeVisible();
    // F3 banner: category name + emoji visible
    const banner = page.locator("[data-component='category-banner']");
    await expect(banner).toBeVisible();
    await expect(banner.locator("[data-banner-name]")).toContainText("Outer Space");
    // Chosen card has state="chosen"; all 5 others have state="dimmed"
    await expect(page.locator("[data-component='category-card'][data-state='chosen']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-component='category-card'][data-state='dimmed']")).toHaveCount(
      5
    );
  });
});

test.describe("TV Stage — category pick while the bank loads (A3 not-ready)", () => {
  test("chooser shows a loading hint in place of the difficulty pips until ready", async ({
    page
  }) => {
    await gotoStage(page, "categoryLoading");
    await expect(page.locator("[data-component='stage-category']")).toBeVisible();
    // The chooser row marks the bank-not-ready wait state and shows the loading hint.
    await expect(page.locator("[data-chooser]")).toHaveAttribute("data-waiting", "true");
    await expect(page.locator("[data-loading-hint]")).toContainText("Loading questions");
    // The 6 cards still render (the grid is stable; only the chooser affordance changes).
    await expect(page.locator("[data-component='category-card']")).toHaveCount(6);
  });
});

test.describe("TV Stage — phase screens render (deterministic fixtures)", () => {
  test("round intro (C1): round number overlay with active player chip", async ({ page }) => {
    await gotoStage(page, "roundIntro");
    const overlay = page.locator("[data-component='round-intro']");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("ROUND");
    // Round number uses data-number
    await expect(overlay.locator("[data-number]")).toBeVisible();
    // Active player chip uses data-chip
    await expect(overlay.locator("[data-chip]")).toBeVisible();
    await expect(overlay.locator("[data-chip-name]")).toContainText("Mochi");
  });

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
    // A8: the "↩ Play Again" coral pill (presentational cue on the TV; players tap it on their phones).
    await expect(page.locator("[data-play-again]")).toBeVisible();
  });
});

// ─── Question variant tests ───────────────────────────────────────────────────────────

test.describe("TV Stage — question variants", () => {
  test("question-RU (A4): Cyrillic prompt and 4 answer tiles", async ({ page }) => {
    await gotoStage(page, "questionRu");
    await expect(
      page.locator("[data-component='stage-question'][data-screen='question']")
    ).toBeVisible();
    await expect(page.locator("[data-prompt]")).toContainText("Химическая формула воды?");
    await expect(page.locator("[data-answer-grid] [data-component='answer-tile']")).toHaveCount(4);
  });

  test("question-flag (A5): image flag hero zone visible, 4 answer tiles, timer", async ({
    page
  }) => {
    await gotoStage(page, "questionFlag");
    await expect(page.locator("[data-hero-image]")).toBeVisible();
    await expect(page.locator("[data-prompt]")).toContainText("flag");
    await expect(page.locator("[data-answer-grid] [data-component='answer-tile']")).toHaveCount(4);
    await expect(page.locator("[data-timer]")).toBeVisible();
  });
});

// ─── Reveal variant tests ─────────────────────────────────────────────────────────────

test.describe("TV Stage — reveal variants (A6)", () => {
  test("reveal wrong→steal (09): wrong tile tagged, answer line present", async ({ page }) => {
    await gotoStage(page, "revealWrongSteal");
    // The picked slot (0) should be tagged wrong; the correct slot (2) tagged correct
    await expect(page.locator("[data-component='answer-tile'][data-state='wrong']")).toHaveCount(1);
    await expect(page.locator("[data-component='answer-tile'][data-state='correct']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-answer-line]")).toContainText("Saturn");
  });

  test("reveal timeout (10): no wrong tag, answer line shows correct answer", async ({ page }) => {
    await gotoStage(page, "revealTimeout");
    // timeout outcome → no wrong-tagged tile (pickedSlot=-1 means no tile picked)
    await expect(page.locator("[data-component='answer-tile'][data-state='wrong']")).toHaveCount(0);
    await expect(page.locator("[data-answer-line]")).toContainText("Saturn");
  });

  test("reveal stolen (11): stolen outcome — chip names the stealer", async ({ page }) => {
    await gotoStage(page, "revealStolen");
    // Score rollup present; correct tile tagged
    await expect(page.locator("[data-component='answer-tile'][data-state='correct']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-answer-line]")).toContainText("Tofu");
    await expect(page.locator("[data-score-rollup]")).toBeVisible();
  });
});

// ─── Overlay tests ────────────────────────────────────────────────────────────────────

test.describe("TV Stage — overlay screens", () => {
  test("pause overlay (C2): 'Paused' text and host name visible", async ({ page }) => {
    await gotoStage(page, "pauseOverlay");
    // The overlay is rendered inline by the harness — check the component attribute
    await expect(page.locator("[data-component='pause-overlay']")).toBeVisible();
    await expect(page.locator("[data-component='pause-overlay'] [data-title]")).toContainText(
      "Paused"
    );
    await expect(page.locator("[data-component='pause-overlay'] [data-message]")).toContainText(
      "Mochi"
    );
  });

  test("disconnect banner (D1): dropped player name shown in their colour", async ({ page }) => {
    await gotoStage(page, "disconnectBanner");
    await expect(page.locator("[data-component='disconnect-banner']")).toBeVisible();
    await expect(page.locator("[data-component='disconnect-banner'] [data-name]")).toContainText(
      "Tofu"
    );
    await expect(
      page.locator("[data-component='disconnect-banner'] [data-countdown]")
    ).toBeVisible();
  });

  test("category exhausted toast (D2): toast names the exhausted category", async ({ page }) => {
    await gotoStage(page, "categoryExhausted");
    await expect(page.locator("[data-component='category-exhausted-toast']")).toBeVisible();
    await expect(
      page.locator("[data-component='category-exhausted-toast'] [data-text]")
    ).toContainText("Animals");
  });

  test("reconnect strip (D3): 'Reconnecting' strip is visible", async ({ page }) => {
    await gotoStage(page, "reconnectStrip");
    await expect(page.locator("[data-component='reconnect-strip']")).toBeVisible();
    await expect(page.locator("[data-component='reconnect-strip'] [data-label]")).toContainText(
      "Reconnecting"
    );
  });

  test("end countdown chip (D4): countdown chip shows seconds on podium", async ({ page }) => {
    await gotoStage(page, "endCountdown");
    await expect(page.locator("[data-component='stage-podium']")).toBeVisible();
    await expect(page.locator("[data-component='end-countdown-chip']")).toBeVisible();
    await expect(
      page.locator("[data-component='end-countdown-chip'] [data-seconds]")
    ).toContainText("5");
  });
});

// ─── Visual baselines ─────────────────────────────────────────────────────────────────

const TV_SCREENS: ReadonlyArray<{ phase: StagePhaseKey; shot: string }> = [
  // Core phase screens (A1–A8, C1, F1)
  { phase: "lobby", shot: "tv-lobby-fixture.png" },
  { phase: "languageVote", shot: "tv-language.png" },
  { phase: "categoryPick", shot: "tv-category.png" },
  // categoryReveal beat (A3 → F3): chosen card glow + banner
  { phase: "categoryReveal", shot: "tv-category-reveal.png" },
  // categoryLoading: bank-not-ready wait — chooser shows the "Loading questions…" line
  { phase: "categoryLoading", shot: "tv-category-loading.png" },
  { phase: "roundIntro", shot: "tv-round-intro.png" },
  { phase: "question", shot: "tv-question.png" },
  { phase: "steal", shot: "tv-steal.png" },
  { phase: "reveal", shot: "tv-reveal.png" },
  { phase: "scoreboard", shot: "tv-scoreboard.png" },
  { phase: "final", shot: "tv-podium.png" },
  // Question variants (A4-RU, A5)
  { phase: "questionRu", shot: "tv-question-ru.png" },
  { phase: "questionFlag", shot: "tv-question-flag.png" },
  // Reveal variants (09, 10, 11)
  { phase: "revealWrongSteal", shot: "tv-reveal-wrong-steal.png" },
  { phase: "revealTimeout", shot: "tv-reveal-timeout.png" },
  { phase: "revealStolen", shot: "tv-reveal-stolen.png" },
  // Overlay screens (C2, D1–D4)
  { phase: "pauseOverlay", shot: "tv-overlay-pause.png" },
  { phase: "disconnectBanner", shot: "tv-overlay-disconnect.png" },
  { phase: "categoryExhausted", shot: "tv-overlay-category-exhausted.png" },
  { phase: "reconnectStrip", shot: "tv-overlay-reconnect.png" },
  { phase: "endCountdown", shot: "tv-overlay-end-countdown.png" }
];

test.describe("TV Stage — phase screen visual baselines", () => {
  for (const { phase, shot } of TV_SCREENS) {
    test(`${phase} matches visual baseline`, async ({ page }) => {
      await gotoStage(page, phase);
      await settleForShot(page);
      // All phases — including lobby — are fully deterministic via the fixture harness.
      // The lobby fixture passes code="TRIV1234" + qr=null (placeholder grid), so no masking needed.
      await expect(page).toHaveScreenshot(shot, { fullPage: false, animations: "disabled" });
    });
  }
});
