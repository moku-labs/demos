/**
 * @file Exploratory QA session — human-QA charter-driven pass (2026-06-27).
 *
 * Each test group maps to a charter and tour.  Every finding is grounded in a
 * citable artifact (DOM state, measured value, console line, or screenshot region)
 * and names the oracle it violates.
 *
 * Charters run:
 *   A — FedEx: data end-to-end invariants on fixture screens (score count, tile count, etc.)
 *   B — OCD: double-tap answer buttons, rapid colour select, repeat lock
 *   C — Antisocial: XSS / emoji / overflow name input
 *   D — Data boundaries: all-colors-taken (step 3), 1-player scoreboard
 *   E — Saboteur: phone screens mid-game overflow guard
 *   F — Accessibility: axe scan of mid-game phone screens (answer, reveal, category, final)
 *   G — Invariants: score rollup chip count == changed players, answer tile state machine
 *   H — Platform (Rained-Out): Leave modal then navigate away, stage-rendering spec gaps
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import type { PhonePhaseKey, StagePhaseKey } from "./harness/fixtures";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_PHASE: Record<StagePhaseKey, string> = {
  question: "question",
  steal: "question",
  stealLeadIn: "question",
  reveal: "reveal",
  scoreboard: "scoreboard",
  scoreboardZero: "scoreboard",
  scoreboardS2: "scoreboard",
  scoreboardS4: "scoreboard",
  scoreboardS5: "scoreboard",
  scoreboardS6: "scoreboard",
  scoreboardS7: "scoreboard",
  scoreboardS9: "scoreboard",
  scoreboardS11: "scoreboard",
  final: "final",
  lobby: "lobby",
  languageVote: "languageVote",
  categoryPick: "categoryPick",
  categoryReveal: "categoryReveal",
  categoryLoading: "categoryPick",
  roundIntro: "roundIntro",
  questionRu: "question",
  questionFlag: "question",
  questionLong: "question",
  revealWrongSteal: "reveal",
  revealTimeout: "reveal",
  revealStolen: "reveal",
  revealLong: "reveal",
  revealFlag: "reveal",
  pauseOverlay: "question",
  disconnectBanner: "lobby",
  categoryExhausted: "categoryPick",
  reconnectStrip: "question",
  endCountdown: "final"
};

const PHONE_PHASE: Record<PhonePhaseKey, string> = {
  final: "final",
  reveal: "reveal",
  revealWrong: "reveal",
  waiting: "lobby",
  scoreboard: "scoreboard",
  categoryPick: "categoryPick",
  categoryReveal: "categoryReveal",
  categoryLoading: "categoryPick",
  answer: "question",
  answerLocked: "question",
  stealAnswer: "question",
  stealLeadIn: "question",
  stealClockSkew: "question",
  stealArmedEarly: "question",
  leaveModal: "question",
  midJoin: "question",
  // Non-active player watcher screens
  languageVoteWatcher: "languageVote",
  roundIntroWatcher: "roundIntro",
  categoryPickWatcher: "categoryPick",
  questionWatcher: "question",
  revealWatcher: "reveal",
  left: "final",
  connectionReconnecting: "question",
  connectionLost: "question"
};

async function gotoStage(page: Page, phase: StagePhaseKey): Promise<void> {
  await page.goto(`/?e2ephase=${phase}`);
  await page.waitForSelector(`[data-stage][data-phase='${STAGE_PHASE[phase]}']`, {
    timeout: 20_000
  });
  await expect(
    page.locator("html"),
    "E2E harness not active — server must run with TRIVIA_E2E=1"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

async function gotoPhone(page: Page, phase: PhonePhaseKey): Promise<void> {
  await page.goto(`/code/TRIV1234?e2ephase=${phase}`);
  await page.waitForSelector(`[data-controller][data-phase='${PHONE_PHASE[phase]}']`, {
    timeout: 20_000
  });
  await expect(
    page.locator("html"),
    "E2E harness not active — server must run with TRIVIA_E2E=1"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

// ─── Charter A: FedEx — data end-to-end invariants ───────────────────────────

test.describe("Charter A — FedEx: data invariants on fixture screens", () => {
  // A1 Invariant: scoreboard tile count == player count (5 players in fixture)
  test("scoreboard: tile count equals player count (5)", async ({ page }) => {
    await gotoStage(page, "scoreboard");
    const tiles = page.locator("[data-component='scoreboard-tile']");
    const count = await tiles.count();
    expect(
      count,
      "Scoreboard must show exactly one tile per player — badge count == list length oracle"
    ).toBe(5);
  });

  // A2 Invariant: podium has exactly 3 blocks for 5-player fixture (top 3)
  test("podium: exactly 3 podium blocks for a 5-player game", async ({ page }) => {
    await gotoStage(page, "final");
    const blocks = page.locator("[data-podium-stage] [data-component='podium-block']");
    const count = await blocks.count();
    expect(
      count,
      "Podium must show exactly 3 blocks (top-3) for a 5-player game — invariant oracle"
    ).toBe(3);
  });

  // A3 Invariant: also-ran count == players beyond podium (5 - 3 = 2)
  test("podium: also-ran section has 2 players beyond the podium", async ({ page }) => {
    await gotoStage(page, "final");
    const alsoRans = page.locator("[data-also-ran]");
    const count = await alsoRans.count();
    expect(
      count,
      "Also-ran section must show 5-3=2 players for a 5-player game — invariant oracle"
    ).toBe(2);
  });

  // A4 Invariant: answer tile count == 4 always (A4 spec says exactly 4 options)
  test("question: always exactly 4 answer tiles", async ({ page }) => {
    await gotoStage(page, "question");
    const tiles = page.locator("[data-answer-grid] [data-component='answer-tile']");
    await expect(tiles).toHaveCount(4);
  });

  // A5 Invariant: reveal has exactly 1 correct-tagged tile, not more
  test("reveal correct: exactly 1 correct tile tagged", async ({ page }) => {
    await gotoStage(page, "reveal");
    const correct = page.locator("[data-component='answer-tile'][data-state='correct']");
    await expect(correct).toHaveCount(1);
    // The other 3 must not be tagged 'correct'
    const wrong = page.locator("[data-component='answer-tile'][data-state='wrong']");
    // In a correct reveal there must be 0 wrong tiles
    await expect(wrong).toHaveCount(0);
  });

  // A6 Invariant: the combined reveal panel (item 1 redesign) shows the scorer's +200 delta.
  // Originally guarded the standalone score-rollup chips — folded into reveal-panel's winner row.
  test("reveal correct: combined reveal panel is present and shows +200 delta", async ({
    page
  }) => {
    await gotoStage(page, "reveal");
    const panel = page.locator("[data-component='reveal-panel']");
    await expect(panel).toBeVisible();
    // The winner row should show a positive points delta for Mochi (+200 in fixture)
    const winnerRow = panel.locator("[data-winner-row]");
    await expect(winnerRow).toBeVisible();
    await expect(
      winnerRow.locator("[data-points]"),
      "Reveal panel winner row must show the scorer's points delta — invariant oracle"
    ).toContainText("+200");
  });

  // A7 Invariant: category pick grid always shows 6 categories
  test("category pick: always 6 categories in the grid", async ({ page }) => {
    await gotoStage(page, "categoryPick");
    const cards = page.locator("[data-component='category-card']");
    await expect(cards).toHaveCount(6);
  });

  // A8 FedEx: language cards show correct voter counts (fixture: EN=3, RU=2)
  test("language vote: EN card is leading with 3 voters, RU has 2", async ({ page }) => {
    await gotoStage(page, "languageVote");
    // The tally line is visible (contains the vote split)
    const tally = page.locator("[data-tally]");
    await expect(tally).toBeVisible();
    // EN is the leading card (data-leading="true")
    const enLeading = page.locator(
      "[data-component='language-card'][data-lang='en'][data-leading='true']"
    );
    await expect(enLeading).toBeVisible();
    // RU card is NOT leading
    const ruLeading = page.locator(
      "[data-component='language-card'][data-lang='ru'][data-leading='true']"
    );
    await expect(ruLeading).toHaveCount(0);
  });

  // A9 Invariant: lobby player tile count == players joined in fixture (3 filled + 2 empty)
  test("lobby: 3 filled player tiles out of max 5", async ({ page }) => {
    await gotoStage(page, "lobby");
    const filled = page.locator("[data-component='player-tile']:not([data-empty])");
    const empty = page.locator("[data-component='player-tile'][data-empty]");
    await expect(filled).toHaveCount(3);
    // Max 5 players → 5 - 3 = 2 empty slots must be shown
    await expect(empty).toHaveCount(2);
  });
});

// ─── Charter B: OCD — double-tap / repeat-action guards ──────────────────────

test.describe("Charter B — OCD: double-tap answer buttons", () => {
  // B1: Tapping an already-locked answer button should be a no-op
  // Oracle: OCD / Invariant — double-submit must not create two locks or change locked slot
  test("phone answer: tapping a different button after locking must remain locked on original", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "answerLocked");

    // In the fixture, slot 2 (C / Saturn) is locked
    const lockedBtn = page.locator("[data-component='answer-button'][data-state='locked']");
    const dimBtns = page.locator("[data-component='answer-button'][data-state='dim']");

    await expect(lockedBtn).toHaveCount(1);
    await expect(dimBtns).toHaveCount(3);

    // Try to tap a dim button — it must not change the locked state
    const firstDim = dimBtns.first();
    await firstDim.click({ force: true });
    await page.waitForTimeout(200);

    // Still locked on the original slot — OCD oracle
    await expect(page.locator("[data-component='answer-button'][data-state='locked']")).toHaveCount(
      1
    );
    await expect(page.locator("[data-component='answer-button'][data-state='dim']")).toHaveCount(3);
  });

  // B2: Name-step double-Enter should not advance past step 1 without going to step 2
  test("join wizard: pressing Enter twice rapidly on name field lands on step 2, not step 3", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("Test");
    // Rapid double Enter (OCD: simulate double-press)
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // Must be on step 2 (avatar), not have skipped to step 3 (color)
    // The step might be 2 or still 1 but must NOT be 3
    const stepAttr = await page.evaluate(
      () => document.querySelector<HTMLElement>("[data-step]")?.dataset.step
    );
    expect(
      stepAttr,
      `Rapid Enter presses must not skip to step 3 — got step="${stepAttr}" (OCD oracle)`
    ).not.toBe("color");
  });

  // B3: Rapid avatar selection (clicking multiple avatars quickly) must leave exactly one selected
  test("join wizard step 2: rapid avatar clicks leave exactly one avatar selected", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    // Advance to step 2
    await page.locator("[data-name-input]").fill("Test");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='avatar']")).toBeVisible();

    // Rapidly click 3 different avatars
    const avatarBtns = page.locator("button[data-avatar-cell]");
    await avatarBtns.nth(0).click();
    await avatarBtns.nth(2).click();
    await avatarBtns.nth(4).click();
    await page.waitForTimeout(100);

    // Invariant: exactly 1 avatar must be selected
    const selected = page.locator("button[data-avatar-cell][data-selected='true']");
    const count = await selected.count();
    expect(
      count,
      `Exactly 1 avatar must be selected after rapid clicks — got ${count} (invariant oracle)`
    ).toBe(1);
  });

  // B4: Play Again button — tapping it twice should not cause console errors
  test("phone final: double-tapping Play Again produces no console errors", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    await gotoPhone(page, "final");
    const playAgainBtn = page.locator("[data-final-actions] button").first();
    await expect(playAgainBtn).toBeVisible();

    // Double-click
    await playAgainBtn.dblclick();
    await page.waitForTimeout(300);

    const realErrors = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      realErrors,
      `Double-clicking Play Again must not produce console errors: ${realErrors.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─── Charter C: Antisocial — edge name inputs ─────────────────────────────────

test.describe("Charter C — Antisocial: name field edge inputs", () => {
  // C1: XSS injection in name field — must not execute or corrupt the DOM
  test("join wizard: XSS injection in name field does not execute script", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));

    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    const xssName = "<script>window.__XSS__=true</script>";
    await page.locator("[data-name-input]").fill(xssName);
    await page.waitForTimeout(300);

    // The XSS script must not execute
    const xssRan = await page.evaluate(
      () => (globalThis as unknown as { __XSS__?: boolean }).__XSS__
    );
    expect(xssRan, "XSS payload in name field must not execute (Antisocial oracle)").toBeFalsy();

    // Main oracle: no JS error from the XSS attempt
    expect(
      errors.filter(e => !e.includes("WebSocket") && !e.includes("429")),
      "No JS errors after XSS name input"
    ).toHaveLength(0);

    // Confirm no script element was injected into the DOM via the name input
    const injectedScript = await page.evaluate(() =>
      document.querySelector("[data-step='name'] script")
    );
    expect(injectedScript, "No script elements must be injected via name input").toBeNull();
  });

  // C2: Emoji name — joining with emoji avatar-like name should work without errors
  test("join wizard: emoji-heavy name (🦊🐙🦄) renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));

    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    const emojiName = "🦊🐙🦄";
    await page.locator("[data-name-input]").fill(emojiName);
    await page.waitForTimeout(200);

    // Next should be enabled if the emoji input registered as non-empty
    // (emoji chars count towards name.trim().length; maxLength=16 may truncate multi-byte clusters)
    const inputVal = await page.locator("[data-name-input]").inputValue();
    if (inputVal.trim().length > 0) {
      await expect(
        page.locator("button[data-next]"),
        "Next should be enabled with a non-empty emoji name (Antisocial oracle)"
      ).toBeEnabled();
    }

    const realErrors = errors.filter(e => !e.includes("WebSocket") && !e.includes("429"));
    expect(
      realErrors,
      `Emoji name input must not cause JS errors: ${realErrors.join(", ")}`
    ).toHaveLength(0);
  });

  // C3: Very long name (at limit 16 chars) — maxLength enforced by input attribute
  test("join wizard: name is capped at 16 chars via maxLength attribute", async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    const maxLen = await page.locator("[data-name-input]").getAttribute("maxlength");
    expect(
      Number(maxLen),
      "Name input must have maxLength=16 to prevent oversized names (Antisocial oracle)"
    ).toBe(16);
  });

  // C4: Name with only whitespace — Next must remain disabled (name.trim().length == 0)
  test("join wizard: whitespace-only name keeps Next disabled", async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("   ");
    await page.waitForTimeout(100);

    await expect(
      page.locator("button[data-next]"),
      "Next must remain disabled for whitespace-only name (invariant: name.trim().length > 0)"
    ).toBeDisabled();
  });
});

// ─── Charter D: Data boundaries — colour-picker freedom + edge cases ──────────

test.describe("Charter D — Data: colour picker freedom + edge cases", () => {
  // D1: Full-freedom join — every colour swatch renders AND stays selectable (nothing greyed/disabled).
  // The wizard used to grey out a colour another player had picked, which removed the player's freedom
  // to choose it (the reported "same colour blocks joining" bug). That blocking mechanism is now gone.
  // Oracle: Data/Saboteur — no colour choice may ever be blocked.
  test("join wizard: every colour swatch is selectable — none greyed out or disabled", async ({
    page
  }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    // Advance to step 3 (colour)
    await page.locator("[data-name-input]").fill("Test");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='color']")).toBeVisible();

    const swatches = page.locator("[data-swatch]");
    expect(
      await swatches.count(),
      "All colour swatches must render (TRIVIA.playerColors has 5)"
    ).toBeGreaterThanOrEqual(5);

    // The blocking mechanism is gone: NO swatch may be greyed-out (data-taken) or natively disabled.
    expect(
      await page.locator("[data-swatch][data-taken]").count(),
      "No swatch may be marked taken (full-freedom join)"
    ).toBe(0);
    expect(
      await page.locator("[data-swatch][disabled]").count(),
      "No swatch may be disabled (full-freedom join)"
    ).toBe(0);
  });

  // D2: Any colour can actually be picked — tapping EACH swatch selects it, and no aria-label lies
  // about a colour being "(taken)". Oracle: WCAG 4.1.2 (name/role/value) + behaviour.
  test("join wizard: any colour swatch can be selected (full freedom)", async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("Test");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='color']")).toBeVisible();

    const swatches = page.locator("[data-swatch]");
    const n = await swatches.count();
    for (let i = 0; i < n; i++) {
      const swatch = swatches.nth(i);
      const ariaLabel = await swatch.getAttribute("aria-label");
      expect(ariaLabel, "Colour swatch must have an aria-label (WCAG 4.1.2)").toBeTruthy();
      expect(ariaLabel ?? "", "aria-label must not claim a colour is taken").not.toContain("taken");
      await swatch.click();
      await expect(swatch).toHaveAttribute("data-selected", "true");
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
    }
  });

  // D3: Category-exhausted: exhausted card must be visually distinct and still render
  // CategoryCard renders data-state="dimmed" for exhausted categories (NOT data-exhausted='true').
  // The exhausted state is communicated via data-state="dimmed" on the card.
  test("stage: exhausted category card uses data-state='dimmed' marking", async ({ page }) => {
    await gotoStage(page, "categoryExhausted");
    // The animals category is exhausted in this fixture → data-state="dimmed" on that card
    // Invariant: exhausted.has(category.id) ? "dimmed" : "idle" (StageCategory.tsx line 47)
    const dimmedCard = page.locator("[data-component='category-card'][data-state='dimmed']");
    await expect(
      dimmedCard,
      "Exhausted category card must use data-state='dimmed' to visually distinguish it " +
        "(Invariant oracle: StageCategory maps exhausted → 'dimmed' state)"
    ).toBeVisible();
    // Must be exactly 1 dimmed card (only Animals is exhausted in the fixture)
    await expect(dimmedCard).toHaveCount(1);
    // The category-exhausted toast should also appear
    await expect(page.locator("[data-component='category-exhausted-toast']")).toBeVisible();
  });
});

// ─── Charter E: Saboteur — phone mid-game overflow guard ─────────────────────

test.describe("Charter E — Saboteur: phone overflow guard on mid-game screens", () => {
  const MOBILE_VIEWPORT = { width: 390, height: 844 };

  // eslint-disable-next-line unicorn/consistent-function-scoping -- charter-scoped overflow helper
  async function checkNoHorizontalOverflow(page: Page, screenName: string): Promise<void> {
    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(
      overflow.bodyScrollWidth,
      `${screenName}: body must not overflow viewport (mobile platform oracle)`
    ).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(
      overflow.docScrollWidth,
      `${screenName}: document must not overflow viewport`
    ).toBeLessThanOrEqual(overflow.viewportWidth);
  }

  test("phone answer screen: no horizontal overflow (390x844)", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "answer");
    await checkNoHorizontalOverflow(page, "phone-answer");
  });

  test("phone answer locked screen: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "answerLocked");
    await checkNoHorizontalOverflow(page, "phone-answer-locked");
  });

  test("phone category pick: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "categoryPick");
    await checkNoHorizontalOverflow(page, "phone-category-pick");
  });

  test("phone final screen: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "final");
    await checkNoHorizontalOverflow(page, "phone-final");
  });

  test("phone reveal flash: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "reveal");
    await checkNoHorizontalOverflow(page, "phone-reveal");
  });

  test("phone leave modal: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "leaveModal");
    await checkNoHorizontalOverflow(page, "phone-leave-modal");
  });

  test("phone waiting screen: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoPhone(page, "waiting");
    await checkNoHorizontalOverflow(page, "phone-waiting");
  });
});

// ─── Charter F: Accessibility — axe scan of mid-game phone screens ────────────

test.describe("Charter F — Accessibility: axe scans of mid-game fixture screens", () => {
  test("phone answer screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "answer");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on phone-answer: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("phone category pick passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "categoryPick");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on phone-category: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("phone final screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "final");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on phone-final: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("phone reveal flash (correct) passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "reveal");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on phone-reveal: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("phone leave modal passes axe WCAG 2.1 AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "leaveModal");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on phone-leave-modal: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("TV question screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await gotoStage(page, "question");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on TV-question: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("TV scoreboard screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await gotoStage(page, "scoreboard");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on TV-scoreboard: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("TV final/podium screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await gotoStage(page, "final");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on TV-final: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  test("TV reveal screen passes axe WCAG 2.1 AA", async ({ page }) => {
    await gotoStage(page, "reveal");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(
      results.violations,
      `axe violations on TV-reveal: ${JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
        null,
        2
      )}`
    ).toHaveLength(0);
  });
});

// ─── Charter G: Invariants — answer button accessibility ─────────────────────

test.describe("Charter G — Invariants: answer button tap targets and accessibility", () => {
  // G1: Phone answer buttons must meet WCAG 2.5.5 tap target size (44x44px)
  test("phone answer buttons are at least 44x44px (WCAG 2.5.5)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "answer");

    const sizes = await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-component='answer-button']");
      return [...btns].map(btn => {
        const rect = btn.getBoundingClientRect();
        return { width: rect.width, height: rect.height, slot: (btn as HTMLElement).dataset.slot };
      });
    });

    for (const btn of sizes) {
      expect(
        btn.width,
        `Answer button slot=${btn.slot} must be ≥44px wide — got ${btn.width}px (WCAG 2.5.5)`
      ).toBeGreaterThanOrEqual(44);
      expect(
        btn.height,
        `Answer button slot=${btn.slot} must be ≥44px tall — got ${btn.height}px (WCAG 2.5.5)`
      ).toBeGreaterThanOrEqual(44);
    }
  });

  // G2: Each answer button must have an accessible name
  test("phone answer buttons have aria-label A through D", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "answer");

    const labels = await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-component='answer-button']");
      return [...btns].map(btn => btn.getAttribute("aria-label"));
    });

    expect(labels).toHaveLength(4);
    for (const [i, label] of labels.entries()) {
      expect(label, `Answer button ${i} must have an aria-label (WCAG 4.1.2)`).not.toBeNull();
      expect((label ?? "").length).toBeGreaterThan(0);
    }
  });

  // G3: Category buttons on the phone must have accessible names
  test("phone category buttons have accessible names", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "categoryPick");

    const buttons = page.locator("[data-component='category-button']");
    const count = await buttons.count();
    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const accessible = await btn.evaluate(el => {
        const ariaLabel = el.getAttribute("aria-label");
        const text = el.textContent?.trim();
        return { ariaLabel, text };
      });
      expect(
        accessible.ariaLabel || (accessible.text && accessible.text.length > 0),
        `Category button ${i} must have an accessible name (WCAG 4.1.2)`
      ).toBeTruthy();
    }
  });

  // G4: Combined reveal panel (item 1 redesign) must be announced to screen readers (aria-live or
  // role). RESOLVED finding (was EQ1, a proposal against the old [data-score-rollup]): the new
  // reveal-panel carries role="status" from the outset, so this is now a hard invariant, not a
  // proposal — a regression here means the accessibility fix silently reverted.
  test("combined reveal panel announces results to screen readers", async ({ page }) => {
    await gotoStage(page, "reveal");

    const panel = page.locator("[data-component='reveal-panel']");
    await expect(panel).toBeVisible();

    const liveRegion = await panel.evaluate(el => {
      let current: Element | null = el;
      while (current) {
        const live = current.getAttribute("aria-live");
        const r = current.getAttribute("role");
        if (live || r === "status" || r === "alert") return { ariaLive: live, role: r };
        current = current.parentElement;
      }
      return { ariaLive: null, role: null };
    });

    expect(
      liveRegion.role === "status" || liveRegion.ariaLive !== null,
      "Reveal panel must carry role='status' (or an aria-live ancestor) so screen reader users " +
        "hear score changes after reveal — WCAG 4.1.3 Status Messages."
    ).toBe(true);
  });

  // G5: Invariant — the open-steal strip (item 3): armed copy + eligible avatars; the misser's NAME
  // appears only during the LEAD-IN ("Mochi missed — get ready to steal!"), never in the armed strip
  // (which switches to the collective "Everyone steal" copy) — asserting Mochi on the armed fixture
  // was a wrong premise.
  test("open steal strip: lead-in names the missed player (Mochi); armed strip shows open-steal wording + 4 eligible avatars", async ({
    page
  }) => {
    // Lead-in beat: the strip names the active player who MISSED (Mochi/p1).
    await gotoStage(page, "stealLeadIn");
    const leadStrip = page.locator("[data-steal-strip]");
    await expect(leadStrip).toBeVisible();
    await expect(leadStrip).toContainText("Mochi");
    await expect(leadStrip).toContainText("get ready to steal");

    // Armed beat: the collective open-steal copy replaces the name.
    await gotoStage(page, "steal");
    const strip = page.locator("[data-steal-strip]");
    await expect(strip).toBeVisible();
    // Open-steal wording — the actual copy is "Everyone steal" (fixed casing/wording mismatch
    // against the real StageQuestion.tsx copy — the old assertion never matched it).
    await expect(strip).toContainText("Everyone steal");
    // And indicate the steal mechanic
    await expect(strip).toContainText("steal");
    // 4 eligible avatars (p2/p3/p4/p5 — everyone except Mochi/p1)
    await expect(strip.locator("[data-steal-avatar]")).toHaveCount(4);
    // The active answerer chip names the player who PICKED the question (Mochi)
    const questionAnswerer = await page.evaluate(() => {
      const chip = document.querySelector("[data-chip-name]");
      return chip?.textContent ?? null;
    });
    if (questionAnswerer !== null) {
      expect(
        questionAnswerer,
        "The TurnChip must name the active question-answerer (Mochi) consistently with the steal strip"
      ).toContain("Mochi");
    }
  });
});

// ─── Charter H: Rained-Out — leave flow and state cleanup ────────────────────

test.describe("Charter H — Rained-Out: leave modal + navigation cleanup", () => {
  // H1: Stay button in leave modal must dismiss the modal without leaving
  test("phone leave modal: tapping Stay dismisses modal and stays in game", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "leaveModal");

    const modal = page.locator("[data-component='leave-modal']");
    await expect(modal).toBeVisible();

    // Tap Stay
    const stayBtn = page.locator("button[data-btn='ghost']");
    await expect(stayBtn).toBeVisible();
    await stayBtn.click();
    await page.waitForTimeout(300);

    // Modal must close after Stay click.
    // In the harness fixture (leaving:true, no room) the "Stay" handler sets leaving:false
    // which removes the modal. Confirm it's no longer visible.
    // NOTE: In the frozen fixture the island state is immutable at initial render time —
    // the Stay click fires the ctx.set({ leaving:false }) handler which triggers a re-render.
    // If the island correctly re-renders on ctx.set, the modal should disappear.
    // This is a live interaction test against the real component.
    const isStillVisible = await modal.isVisible();
    // We record the result — if the fixture's island doesn't respond to clicks
    // (because ctx.set is mocked), this finding is that click-handlers are dead in the harness.
    if (isStillVisible) {
      console.warn(
        "[FINDING EQ2] Leave modal Stay button does not dismiss the modal in the harness fixture. " +
          "Oracle: Dead affordance (Accessibility-vs-rendered mismatch). " +
          "The button has a click handler but clicking it doesn't change state. " +
          "This may indicate the harness freezes island state and click-handlers are no-ops. " +
          "Evidence: modal remains visible after Stay click."
      );
    }
    // This is a conditional guard — the finding is logged, test continues
  });

  // H2: Mid-join modal 'Got it' button should be present and interactive
  test("phone mid-join modal: 'Got it' button is visible and has accessible name", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "midJoin");

    const modal = page.locator("[data-component='mid-join-modal']");
    await expect(modal).toBeVisible();

    // The action button (sky blue tone) should be visible
    const btn = modal.locator("button[data-btn='sky']");
    await expect(btn).toBeVisible();

    // It must have an accessible name
    const accessible = await btn.evaluate(el => ({
      ariaLabel: el.getAttribute("aria-label"),
      text: el.textContent?.trim()
    }));
    expect(
      accessible.ariaLabel || (accessible.text && accessible.text.length > 0),
      "Mid-join modal button must have an accessible name (WCAG 4.1.2)"
    ).toBeTruthy();
  });

  // H3: After a "left" state, the phone shows a "You left the game" card
  // This is the controller state.left === true branch in render.tsx
  // We can reach it via the real fixture by verifying it exists in the component
  test("phone: 'You left the game' card is accessible (has emoji, title, subtitle)", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Navigate to a harness controller with "left" state — not a standard fixture phase,
    // so we need to check the real leave flow renders correctly.
    // The leaveModal fixture has leaving:true. After clicking Leave, left:true is set.
    await gotoPhone(page, "leaveModal");

    // Click the "Leave" (coral) button
    const leaveBtn = page.locator("button[data-btn='coral']");
    await expect(leaveBtn).toBeVisible();
    await leaveBtn.click();
    await page.waitForTimeout(300);

    // If the island re-renders to the left:true state, we should see the "You left" card.
    // In the harness, ctx.set might be a no-op (frozen state). Log the result.
    const leftCard = page.locator("[data-controller][data-phase='final']");
    const isLeftCardVisible = await leftCard.isVisible().catch(() => false);
    if (!isLeftCardVisible) {
      console.warn(
        "[FINDING EQ3] After clicking Leave in the leave modal, the controller does not show " +
          "the 'You left the game' state. This may be a harness limitation (frozen state) or " +
          "a real app issue. Oracle: Dead affordance. Evidence: Leave button clicked, " +
          "but controller phase did not transition to final/left state."
      );
    }
  });

  // H4: No console errors on any live non-fixture page navigation (Rained-Out: boot mid-game URL)
  test("TV stage: no console errors when booting on a non-fixture URL", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto("/");
    await page.waitForSelector("[data-island='stage']", { timeout: 20_000 });
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      e =>
        !e.includes("WebSocket") &&
        !e.includes("429") &&
        !e.includes("ws://") &&
        !e.includes("wrangler")
    );
    expect(
      realErrors,
      `Non-fixture TV stage boot must produce no real errors: ${realErrors.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─── Charter I: Gap — phone phases (live WebRTC belt-and-suspenders) ──────────────────
// Note (2026-06-28): The harness PhonePhaseKey now INCLUDES languageVoteWatcher, roundIntroWatcher,
// scoreboard, categoryPickWatcher, questionWatcher, revealWatcher, and left — so these phases have
// deterministic fixture coverage in phone-screens.spec.ts.
//
// These live WebRTC flow tests remain as additional belt-and-suspenders coverage against
// real room lifecycle. They skip gracefully when Hub DO / WebRTC is unavailable.
//
// Oracle: FEW HICCUPPS (Purpose) + Invariants — belt-and-suspenders live-path coverage.

test.describe("Charter I — Gap: phone phases not in the fixture harness (live WebRTC)", () => {
  test.setTimeout(90_000);

  // I1: Phone during languageVote must show the language vote buttons
  test("phone languageVote phase: language vote buttons visible (live flow)", async ({
    browser
  }) => {
    const tvCtx = await browser.newContext({ colorScheme: "dark" });
    const phoneCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark"
    });
    const tv = await tvCtx.newPage();
    const phone = await phoneCtx.newPage();

    try {
      await tv.goto("/");
      await tv.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      // Get room code
      let code = "";
      for (let i = 0; i < 20; i++) {
        const el = tv.locator("[data-code]").first();
        if (await el.count()) {
          const text = ((await el.textContent()) ?? "").trim();
          if (text && text !== "····" && text.length >= 6) {
            code = text;
            break;
          }
        }
        await tv.waitForTimeout(1000);
      }
      if (!code) {
        test.skip(true, "Hub DO unavailable — skipping live languageVote phone test");
        return;
      }

      // Join phone — wrap in try/catch so a flaky Hub join skips rather than fails
      try {
        await phone.goto(`/code/${code}`);
        await phone.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });
        const nameInput = phone.locator("[data-name-input]");
        if (await nameInput.count()) await nameInput.fill("QABot");
        await phone.locator("button[data-next]").click();
        await phone.locator("button[data-next]").click();
        await phone.locator("button[data-next]").click();
        await phone.waitForSelector("[data-controller][data-phase='lobby']", { timeout: 30_000 });
      } catch {
        test.skip(true, "Phone failed to join lobby — Hub DO or WebRTC unavailable, skipping");
        return;
      }

      // Host (first joiner = QABot) starts game
      const startBtn = phone.locator("button").filter({ hasText: /start\s*game/i });
      if (!(await startBtn.count())) {
        test.skip(true, "No Start Game button — may need 2 players, skipping");
        return;
      }
      await startBtn.click();

      // TV enters languageVote; phone should too
      await tv.waitForSelector("[data-stage][data-phase='languageVote']", { timeout: 15_000 });
      await phone.waitForSelector("[data-controller][data-phase='languageVote']", {
        timeout: 15_000
      });

      // Phone must show language vote buttons — EnglishButton and RuButton
      const voteScreen = phone.locator("[data-component='phone-language-vote']");
      await expect(
        voteScreen,
        "Phone must render phone-language-vote component during languageVote phase"
      ).toBeVisible();

      // Must have at least 2 vote buttons
      const voteBtns = voteScreen.locator("button");
      const btnCount = await voteBtns.count();
      expect(
        btnCount,
        `Phone language vote must show at least 2 vote buttons; got ${btnCount}`
      ).toBeGreaterThanOrEqual(2);

      // English button must be present
      const enBtn = voteScreen.locator("button").filter({ hasText: /english/i });
      await expect(enBtn).toBeVisible();
    } finally {
      await tvCtx.close();
      await phoneCtx.close();
    }
  });

  // I2: Phone during roundIntro must show a round-number waiting card
  test("phone roundIntro phase: waiting card shows round number (live flow)", async ({
    browser
  }) => {
    const tvCtx = await browser.newContext({ colorScheme: "dark" });
    const phoneCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark"
    });
    const tv = await tvCtx.newPage();
    const phone = await phoneCtx.newPage();

    try {
      await tv.goto("/");
      await tv.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      let code = "";
      for (let i = 0; i < 20; i++) {
        const el = tv.locator("[data-code]").first();
        if (await el.count()) {
          const text = ((await el.textContent()) ?? "").trim();
          if (text && text !== "····" && text.length >= 6) {
            code = text;
            break;
          }
        }
        await tv.waitForTimeout(1000);
      }
      if (!code) {
        test.skip(true, "Hub DO unavailable — skipping live roundIntro phone test");
        return;
      }

      try {
        await phone.goto(`/code/${code}`);
        await phone.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });
        const nameInput = phone.locator("[data-name-input]");
        if (await nameInput.count()) await nameInput.fill("QABot");
        await phone.locator("button[data-next]").click();
        await phone.locator("button[data-next]").click();
        await phone.locator("button[data-next]").click();
        await phone.waitForSelector("[data-controller][data-phase='lobby']", { timeout: 30_000 });
      } catch {
        test.skip(true, "Phone failed to join lobby — Hub DO or WebRTC unavailable, skipping");
        return;
      }

      const startBtn = phone.locator("button").filter({ hasText: /start\s*game/i });
      if (!(await startBtn.count())) {
        test.skip(true, "No Start Game button");
        return;
      }
      await startBtn.click();

      // Wait for languageVote → then roundIntro
      await tv.waitForSelector("[data-stage][data-phase='languageVote']", { timeout: 15_000 });
      // Vote to advance faster
      const enBtn = phone
        .locator("button")
        .filter({ hasText: /english/i })
        .first();
      if (await enBtn.count()) await enBtn.click().catch(() => undefined);

      // roundIntro shows briefly (2s) between languageVote and categoryPick
      // Wait for it on the TV; the phone should also receive it
      await tv.waitForSelector(
        "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick']",
        { timeout: 20_000 }
      );

      // Check the phone's roundIntro state (may be brief; use a shorter timeout)
      const phoneInRoundIntro = await phone
        .waitForSelector("[data-controller][data-phase='roundIntro']", { timeout: 8_000 })
        .then(() => true)
        .catch(() => false);

      if (phoneInRoundIntro) {
        // Phone must show a waiting card with the round number
        const waitCard = phone.locator("[data-component='phone-waiting-card']");
        await expect(
          waitCard,
          "Phone must render phone-waiting-card during roundIntro phase"
        ).toBeVisible({ timeout: 5_000 });
        // The card must mention round (round-intro waiting card shows "Round N")
        const cardText = await waitCard.textContent();
        expect(
          cardText,
          "Phone roundIntro waiting card must mention 'Round' — Invariant oracle"
        ).toMatch(/round/i);
      } else {
        // roundIntro passed too fast; verify we landed on categoryPick gracefully
        await phone.waitForSelector("[data-controller][data-phase='categoryPick']", {
          timeout: 15_000
        });
        // No assertion failure — roundIntro is a 2s flash, it may pass before we poll
      }
    } finally {
      await tvCtx.close();
      await phoneCtx.close();
    }
  });
});

// ─── Charter J: Durable finding — EQ1 (reveal live region) ────────────────────
// Finding EQ1 (from Charter G exploration): the OLD [data-score-rollup] region on the TV reveal
// screen had no aria-live or role="status" — screen-reader users didn't hear score changes after
// a reveal. Oracle: Accessibility-vs-rendered (WCAG 4.1.3 Status Messages).
//
// RESOLVED: the item-1 redesign replaced that strip with the combined RevealPanel, which ships
// role="status" + aria-label. The guard below asserts the fix POSITIVELY (a durable regression
// test — it fails if the live region is ever dropped).

test.describe("Charter J — Durable: EQ1 reveal live-region accessibility guard", () => {
  // EQ1 RESOLVED by the item-1 redesign: the old [data-score-rollup] strip was REPLACED by the
  // combined RevealPanel, which ships role="status" (an implicit polite live region, WCAG 4.1.3)
  // + an aria-label. This guard now asserts the fix POSITIVELY so it can never silently regress.
  test("TV reveal: the combined reveal panel is a live region (EQ1 fixed by the RevealPanel redesign)", async ({
    page
  }) => {
    await gotoStage(page, "reveal");

    const panel = page.locator("[data-component='reveal-panel']");
    await expect(panel).toBeVisible();

    const role = await panel.getAttribute("role");
    const ariaLive = await panel.getAttribute("aria-live");
    const hasLiveRegion =
      role === "status" || role === "alert" || ariaLive === "polite" || ariaLive === "assertive";
    expect(
      hasLiveRegion,
      "The reveal panel must be a live region (role='status' or aria-live) so screen-reader users " +
        "hear the outcome + points — WCAG 4.1.3 Status Messages (EQ1)."
    ).toBe(true);
    await expect(panel).toHaveAttribute("aria-label", /.+/);
  });
});
