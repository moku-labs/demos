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
  // Pre-steal lead-in renders the question screen (steal strip in its "get ready" state)
  stealLeadIn: "question",
  reveal: "reveal",
  scoreboard: "scoreboard",
  // Scoreboard with a not-yet-scored connected player still on the board
  scoreboardZero: "scoreboard",
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
  questionLong: "question",
  // Reveal variants
  revealWrongSteal: "reveal",
  revealTimeout: "reveal",
  revealStolen: "reveal",
  // Item 1 hard layout cases: the combined reveal panel over a long/image question
  revealLong: "reveal",
  revealFlag: "reveal",
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

  test("steal (F1 open-steal): armed strip shows 'everyone steal', 4 eligible avatars, answered progress + shared timer", async ({
    page
  }) => {
    await gotoStage(page, "steal");
    const strip = page.locator("[data-steal-strip]");
    await expect(strip).toBeVisible();
    // Armed (lead-in over): not in the "get ready" state.
    await expect(strip).not.toHaveAttribute("data-arming", "true");
    // New open-steal wording — every correct answer scores, fastest earns most.
    await expect(strip).toContainText("Everyone steal");
    await expect(strip).toContainText("fastest wins most");
    // Live answered progress (fixture: p3 has answered → "1/4 in").
    await expect(strip).toContainText("1/4");
    // 4 eligible avatars (p2/p3/p4/p5 — everyone except the active player p1); the answered one dims.
    await expect(strip.locator("[data-steal-avatar]")).toHaveCount(4);
    await expect(strip.locator("[data-steal-avatar][data-answered]")).toHaveCount(1);
    // Shared countdown timer + eligible row container
    await expect(strip.locator("[data-steal-secs]")).toBeVisible();
    await expect(strip.locator("[data-steal-eligible]")).toBeVisible();
  });

  test("steal lead-in (item 3): 'get ready to steal' countdown, arming flag set, no answered avatars yet", async ({
    page
  }) => {
    await gotoStage(page, "stealLeadIn");
    const strip = page.locator("[data-steal-strip]");
    await expect(strip).toBeVisible();
    // During the lead-in the strip marks the arming state and shows the "get ready" copy.
    await expect(strip).toHaveAttribute("data-arming", "true");
    await expect(strip).toContainText("get ready to steal");
    await expect(strip).toContainText("Mochi"); // the active player who missed
    // No one has answered during the lead-in (nobody can tap yet).
    await expect(strip.locator("[data-steal-avatar][data-answered]")).toHaveCount(0);
  });

  test("steal reveal (item 1 combined panel): winner row + others row — times, ⚡ fastest, ✓/✗, points, named answer tiles", async ({
    page
  }) => {
    await gotoStage(page, "revealStolen");
    const panel = page.locator("[data-component='reveal-panel']");
    await expect(panel).toBeVisible();
    // Winner row: Tofu (p3), fastest correct stealer — name, answer time, ⚡ badge, points.
    const winnerRow = panel.locator("[data-winner-row]");
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText("Tofu");
    await expect(winnerRow.locator("[data-fastest-badge]")).toBeVisible();
    await expect(winnerRow.locator("[data-time]")).toContainText("9.2s");
    await expect(winnerRow.locator("[data-points]")).toContainText("+100");
    // Other participants (Pixel ✓ slower, Biscuit ✗) each show their own time, on the SAME line
    // in the SAME pill style as the winner (user refinement — one horizontal slot, uniform pills).
    const others = panel.locator("[data-other]");
    await expect(others).toHaveCount(2);
    await expect(others.filter({ hasText: "Pixel" })).toHaveCount(1);
    await expect(others.filter({ hasText: "Pixel" }).locator("[data-time]")).toContainText("14.7s");
    await expect(others.filter({ hasText: "Pixel" }).locator("[data-points]")).toContainText("+60");
    await expect(others.filter({ hasText: "Biscuit" })).toHaveCount(1);
    await expect(others.filter({ hasText: "Biscuit" }).locator("[data-time]")).toContainText(
      "6.4s"
    );
    await expect(others.filter({ hasText: "Biscuit" }).locator("[data-points]")).toHaveCount(0);
    // Same horizontal line, same pill style (user refinement): the winner pill and the other pills
    // share one row (same y) at one uniform height — no big-vs-small stacking.
    const winnerBox = await winnerRow.boundingBox();
    const otherBox = await others.first().boundingBox();
    expect(Math.abs((winnerBox?.y ?? 0) - (otherBox?.y ?? 999))).toBeLessThan(2);
    expect(Math.abs((winnerBox?.height ?? 0) - (otherBox?.height ?? 999))).toBeLessThan(2);
    // The reveal grid still tags the correct tile with the winner's name (multi-player steal).
    const correct = page.locator("[data-component='answer-tile'][data-state='correct'] [data-tag]");
    await expect(correct).toContainText("Tofu");
  });

  test("reveal (A6): correct tile tagged, answer line, combined panel shows the winner's points — no time on a direct answer (item 1/2)", async ({
    page
  }) => {
    await gotoStage(page, "reveal");
    const correctTile = page.locator("[data-component='answer-tile'][data-state='correct']");
    await expect(correctTile).toHaveCount(1);
    await expect(correctTile.locator("[data-tag]")).toContainText("CORRECT");
    await expect(page.locator("[data-answer-line]")).toContainText("Saturn");
    // Item 1: the combined reveal panel replaces the old separate score-rollup — a single winner row
    // (no steal happened) with the scorer's name + points gained. NO answer time (user refinement):
    // times are a steal-speed comparison only; a regular direct answer never shows one.
    const panel = page.locator("[data-component='reveal-panel']");
    await expect(panel).toBeVisible();
    const winnerRow = panel.locator("[data-winner-row]");
    await expect(winnerRow).toContainText("Mochi");
    await expect(winnerRow.locator("[data-time]")).toHaveCount(0);
    await expect(winnerRow.locator("[data-points]")).toContainText("+200");
    // No other participants on the no-steal fast path — the winner pill stands alone.
    await expect(panel.locator("[data-other]")).toHaveCount(0);
  });

  test("scoreboard (A7): titled standings, one tile per player", async ({ page }) => {
    await gotoStage(page, "scoreboard");
    await expect(page.locator("[data-component='stage-scoreboard'] [data-title]")).toContainText(
      "Standings after Round 6"
    );
    await expect(page.locator("[data-component='scoreboard-tile']")).toHaveCount(5);
    // The round gain is demonstrated by a "+N" badge on the tiles that scored this round (Mochi +200);
    // tiles with no gain show none. (The score + bar also count up from the pre-round figure — animated.)
    await expect(page.locator("[data-component='scoreboard-tile'] [data-gain]")).toHaveCount(1);
    await expect(page.locator("[data-component='scoreboard-tile'] [data-gain]")).toContainText(
      "+200"
    );
  });

  test("scoreboard zero-score (item 2): a connected player who has not scored yet still appears at 0", async ({
    page
  }) => {
    await gotoStage(page, "scoreboardZero");
    // Fixture: Sprout (p5) is connected but has NO score row — they must still show on the board (5 tiles).
    await expect(page.locator("[data-component='scoreboard-tile']")).toHaveCount(5);
    const sprout = page.locator("[data-component='scoreboard-tile']").filter({ hasText: "Sprout" });
    await expect(sprout).toBeVisible();
    await expect(sprout.locator("[data-score]")).toHaveText("0");
    // A never-scored player shows no "+N" gain badge.
    await expect(sprout.locator("[data-gain]")).toHaveCount(0);
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

  // Image questions get a dedicated layout: the image must read CLEARLY at a normal size and never
  // overlap the timer (top) or the answer grid (bottom). Regression guard for the broken flag layout
  // (image shrank to a 60px thumbnail jammed under the timer ring).
  test("question-flag (A5): image is normal-sized and does NOT overlap the timer or answer grid", async ({
    page
  }) => {
    await gotoStage(page, "questionFlag");
    await settleForShot(page);

    const flag = await page.locator("[data-hero-image] [data-component='flag']").boundingBox();
    const timer = await page.locator("[data-timer]").boundingBox();
    const grid = await page.locator("[data-answer-grid]").boundingBox();
    expect(flag, "flag image must render").not.toBeNull();
    expect(timer).not.toBeNull();
    expect(grid).not.toBeNull();
    if (flag && timer && grid) {
      // Clear, normal size — not the 60×38 default thumbnail.
      expect(
        flag.height,
        "flag must be a clear, normal size (not a tiny thumbnail)"
      ).toBeGreaterThan(90);
      // No vertical overlap with the timer above (flag top below the timer's bottom edge)…
      expect(flag.y, "flag must sit below the timer ring").toBeGreaterThanOrEqual(
        timer.y + timer.height - 1
      );
      // …nor with the answer grid below (flag bottom above the grid's top edge).
      expect(flag.y + flag.height, "flag must sit above the answer grid").toBeLessThanOrEqual(
        grid.y + 1
      );
    }
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
    // Combined reveal panel present (item 1); correct tile tagged
    await expect(page.locator("[data-component='answer-tile'][data-state='correct']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-answer-line]")).toContainText("Tofu");
    await expect(page.locator("[data-component='reveal-panel']")).toBeVisible();
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

// ─── Item 1: question auto-fit (long prompt) ──────────────────────────────────────────

test.describe("TV Stage — question auto-fit (item 1)", () => {
  test("questionLong: prompt fits box, answer grid fully on-screen, fit hook wired and active", async ({
    page
  }) => {
    await gotoStage(page, "questionLong");
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Wait for the fit-text hook to settle (ResizeObserver + fonts.ready).
    await page.waitForTimeout(400);

    // 1a. Answer grid is fully visible (not clipped, bounding box within viewport)
    const gridBox = await page.locator("[data-answer-grid]").boundingBox();
    expect(gridBox).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    // Grid must be fully within the viewport (safe access — asserts above guard these)
    if (gridBox && viewport) {
      expect(gridBox.y + gridBox.height).toBeLessThanOrEqual(viewport.height + 2);
      expect(gridBox.y).toBeGreaterThanOrEqual(0);
    }

    // 1b. Prompt does not overflow its fit box (the hook scales it down as needed)
    const overflow = await page.locator("[data-prompt-fit]").evaluate(el => {
      return {
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth
      };
    });
    // scrollHeight > clientHeight + 2 indicates vertical overflow
    expect(overflow.scrollH).toBeLessThanOrEqual(overflow.clientH + 2);

    // 1c. The fit hook sets an explicit inline font-size on [data-prompt] (the hook ran)
    const inlineFontSize = await page.locator("[data-prompt]").evaluate(el => {
      return (el as HTMLElement).style.fontSize;
    });
    expect(inlineFontSize).toMatch(/^\d+px$/);

    // 1d. 4 answer tiles still visible
    await expect(page.locator("[data-answer-grid] [data-component='answer-tile']")).toHaveCount(4);
    // 1e. The [data-prompt-fit] wrapper exists
    await expect(page.locator("[data-prompt-fit]")).toBeVisible();
  });
});

// ─── Item 1: combined reveal panel over the HARD layout cases ────────────────────────

test.describe("TV Stage — combined reveal panel over hard layout cases (item 1)", () => {
  test("revealLong: the panel does not overlap the question hero or the answer grid, and the prompt stays legible", async ({
    page
  }) => {
    await gotoStage(page, "revealLong");
    await settleForShot(page);

    const hero = await page.locator("[data-hero]").boundingBox();
    const grid = await page.locator("[data-answer-grid]").boundingBox();
    const panel = await page.locator("[data-component='reveal-panel']").boundingBox();
    expect(hero, "hero must render").not.toBeNull();
    expect(grid).not.toBeNull();
    expect(panel, "the combined reveal panel must render").not.toBeNull();

    if (hero && grid && panel) {
      // The panel sits BELOW the answer grid — no vertical overlap with the grid above it.
      expect(panel.y, "panel must sit below the answer grid").toBeGreaterThanOrEqual(
        grid.y + grid.height - 1
      );
      // The panel never overlaps the hero (question text) above it either.
      expect(panel.y).toBeGreaterThanOrEqual(hero.y + hero.height - 1);
    }

    // The prompt still fits its box with no overflow (the auto-fit hook + the panel's fixed compact
    // size coexist without fighting over space).
    const overflow = await page.locator("[data-prompt-fit]").evaluate(el => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight
    }));
    expect(overflow.scrollH).toBeLessThanOrEqual(overflow.clientH + 2);

    // The panel itself stays compact — it must never grow into a "wall of chips" per the design
    // requirement (winner row + a short others row only, well under half the viewport height).
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (panel && viewport) {
      expect(panel.height).toBeLessThan(viewport.height * 0.25);
    }
  });

  test("revealFlag: the panel sits below the image without overlapping or shrinking it", async ({
    page
  }) => {
    await gotoStage(page, "revealFlag");
    await settleForShot(page);

    const flag = await page.locator("[data-hero-image] [data-component='flag']").boundingBox();
    const panel = await page.locator("[data-component='reveal-panel']").boundingBox();
    expect(flag, "flag image must render").not.toBeNull();
    expect(panel).not.toBeNull();

    if (flag && panel) {
      // The image stays a clear, normal size (not shrunk to a thumbnail) — same guard as the A5
      // question-screen regression test, now proven WITH the reveal panel also on screen.
      expect(flag.height, "flag must stay a clear, normal size").toBeGreaterThan(90);
      // No vertical overlap between the image and the panel below it.
      expect(panel.y).toBeGreaterThanOrEqual(flag.y + flag.height - 1);
    }
  });
});

// ─── Item 2: scoreboard bar-track equality ────────────────────────────────────────────

test.describe("TV Stage — scoreboard bar tracks (item 2)", () => {
  test("scoreboard: all [data-bar] tracks have equal width regardless of whether row has [data-gain]", async ({
    page
  }) => {
    await gotoStage(page, "scoreboard");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(600); // let count-up settle

    // Collect all [data-bar] widths — they must all be equal (same track; fill is the inner span)
    const barWidths = await page
      .locator("[data-component='scoreboard-tile'] [data-bar]")
      .evaluateAll(bars => bars.map(b => (b as HTMLElement).getBoundingClientRect().width));
    expect(barWidths.length).toBe(5);
    const first = barWidths[0] ?? 0;
    for (const w of barWidths) {
      expect(Math.abs(w - first)).toBeLessThan(2); // sub-pixel tolerance
    }
  });

  test("scoreboard: moved-up tile (Pixel overtaking Tofu) has [data-moved-up] attribute", async ({
    page
  }) => {
    await gotoStage(page, "scoreboard");
    // The fixture has Pixel (p2, total 1100) overtaking Tofu (p3, total 800)
    // rank() re-sorts by total: p1=1, p2=2 (was 3), p3=3 (was 2) → p2 climbed 1
    await expect(
      page.locator("[data-component='scoreboard-tile'][data-moved-up='true']")
    ).toHaveCount(1);
  });
});

// ─── Item 3: scoreboard choreography — delta-first, THEN the FLIP reorder ─────────────
// Real (non-reduced) motion, deterministic via the `data-choreography` state hook and the
// overtaking tile's live `transform` — proves the SEQUENCE, not just the end state.

test.describe("TV Stage — scoreboard overtake choreography (item 3)", () => {
  test("delta chip + count-up show BEFORE the FLIP reorder starts (sequenced, not simultaneous)", async ({
    page
  }) => {
    // Real motion — this test proves the live sequencing, not the settled end-state.
    await gotoStage(page, "scoreboard");
    const root = page.locator("[data-component='stage-scoreboard']");
    const mover = page.locator("[data-component='scoreboard-tile'][data-moved-up='true']");

    // Phase 1 — "delta": the round-gain badge is visible immediately, and the mover is still held
    // at its PRE-round offset (a non-zero translateY — it has not reordered onto the final row yet).
    await expect(root).toHaveAttribute("data-choreography", "delta");
    await expect(page.locator("[data-component='scoreboard-tile'] [data-gain]")).toHaveCount(1);
    const preReorderTransform = await mover.evaluate(el => (el as HTMLElement).style.transform);
    expect(preReorderTransform).toMatch(/translateY\((?!0px\)).+\)/);

    // Phase 2 — "reorder": once the delta beat's hold elapses, the root flips to "reorder" and the
    // mover's transform is actively animating toward rest (still mid-flight, not yet 0).
    await expect(root).toHaveAttribute("data-choreography", "reorder", { timeout: 3000 });
    await expect(mover).toHaveCSS("transition-property", "transform");

    // Phase 3 — "settled": the FLIP transition completes and the whole choreography rests.
    await expect(root).toHaveAttribute("data-choreography", "settled", { timeout: 2000 });
    await expect
      .poll(async () => mover.evaluate(el => (el as HTMLElement).style.transform), {
        timeout: 2000
      })
      .toBe("translateY(0px)");
  });

  test("reduced motion collapses straight to the settled choreography (no staggering)", async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");
    await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
      "data-choreography",
      "settled"
    );
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
  // Item 3: pre-steal "get ready" lead-in (armed shortly) — new baseline
  { phase: "stealLeadIn", shot: "tv-steal-lead-in.png" },
  { phase: "reveal", shot: "tv-reveal.png" },
  { phase: "scoreboard", shot: "tv-scoreboard.png" },
  // Item 2: a connected player with no score still on the board — new baseline
  { phase: "scoreboardZero", shot: "tv-scoreboard-zero.png" },
  { phase: "final", shot: "tv-podium.png" },
  // Question variants (A4-RU, A5, long auto-fit)
  { phase: "questionRu", shot: "tv-question-ru.png" },
  { phase: "questionFlag", shot: "tv-question-flag.png" },
  // Item 1: long prompt auto-fit — new baseline
  { phase: "questionLong", shot: "tv-question-long.png" },
  // Reveal variants (09, 10, 11)
  { phase: "revealWrongSteal", shot: "tv-reveal-wrong-steal.png" },
  { phase: "revealTimeout", shot: "tv-reveal-timeout.png" },
  { phase: "revealStolen", shot: "tv-reveal-stolen.png" },
  // Item 1 hard layout cases: the combined reveal panel over a long/image question
  { phase: "revealLong", shot: "tv-reveal-long.png" },
  { phase: "revealFlag", shot: "tv-reveal-flag.png" },
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
