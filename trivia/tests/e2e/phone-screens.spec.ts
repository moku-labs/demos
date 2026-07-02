/**
 * @file Phone controller — deterministic phase-screen tests + visual baselines.
 *
 * The live flow never reaches post-lobby phone screens in tests; the harness closes that gap by
 * driving the REAL controller render with frozen fixture state through the e2e harness —
 * `/code/<code>?e2ephase=<phase>` mounts a fixture island (no room, no Hub) as a specific
 * player so each screen renders identically every run.
 *
 * Requires the harness build (TRIVIA_E2E=1, set by the Playwright webServer).
 *
 * ## Design coverage (spec/design-context.md §6)
 * - A9 join wizard (existing in controller-rendering.spec.ts — not duplicated here)
 * - A10 waiting room, A11 phone category pick, A12 answer grid (+ locked state),
 *   A13 reveal flash correct, A14 reveal flash wrong, A15 final card,
 *   E1 leave modal, E2 mid-join modal.
 * - Non-active watcher screens: languageVote, roundIntro, categoryPickWatcher,
 *   questionWatcher, revealWatcher, left.
 * - /code entry page (join-by-code box) — new route, visual baseline.
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
  scoreboard: "scoreboard",
  categoryPick: "categoryPick",
  // categoryReveal: active player sees the same category-pick list but with chosen button highlighted
  categoryReveal: "categoryReveal",
  // categoryLoading: picker open but bank still loading — renders the categoryPick screen (buttons inert)
  categoryLoading: "categoryPick",
  answer: "question",
  answerLocked: "question",
  stealAnswer: "question",
  stealLeadIn: "question",
  leaveModal: "question",
  midJoin: "question",
  // Non-active player watcher screens
  languageVoteWatcher: "languageVote",
  roundIntroWatcher: "roundIntro",
  categoryPickWatcher: "categoryPick",
  questionWatcher: "question",
  revealWatcher: "reveal",
  // left: state.left=true renders the "You left" card inside data-phase="final"
  left: "final",
  // Item 4 (connectivity audit): the connection banner overlays the underlying (question) screen.
  connectionReconnecting: "question",
  connectionLost: "question"
};

/** Navigate to a fixture phone screen and wait for the controller to render it. */
async function gotoPhone(page: Page, phase: PhonePhaseKey): Promise<void> {
  await page.goto(`/code/TRIV1234?e2ephase=${phase}`);
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

test.describe("Phone — round→score transition (A7)", () => {
  test("scoreboard phase shows the 'Round done · next round' card with next difficulty pips", async ({
    page
  }) => {
    await gotoPhone(page, "scoreboard");
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("done");
    // The next round's difficulty pips are shown in the card body.
    await expect(page.locator("[data-component='difficulty-pips']")).toBeVisible();
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

test.describe("Phone — category reveal beat (A11 feedback)", () => {
  test("chosen category button is selected; others fade and are non-interactive", async ({
    page
  }) => {
    await gotoPhone(page, "categoryReveal");
    const root = page.locator("[data-component='phone-category']");
    await expect(root).toBeVisible();
    // Root marks the revealing state
    await expect(root).toHaveAttribute("data-revealing", "true");
    // 6 buttons still present
    await expect(page.locator("[data-component='category-button']")).toHaveCount(6);
    // Exactly 1 button is in selected state (the chosen "space" category)
    await expect(
      page.locator("[data-component='category-button'][data-selected='true']")
    ).toHaveCount(1);
  });
});

test.describe("Phone — category pick while the bank loads (A11 not-ready)", () => {
  test("buttons render inert under a loading hint until the bank is ready", async ({ page }) => {
    await gotoPhone(page, "categoryLoading");
    const root = page.locator("[data-component='phone-category']");
    await expect(root).toBeVisible();
    // Root marks the bank-not-ready wait state.
    await expect(root).toHaveAttribute("data-waiting", "true");
    // The 6 buttons still render (stable layout) but are non-interactive (a tap is never dropped silently).
    await expect(page.locator("[data-component='category-button']")).toHaveCount(6);
    await expect(page.locator("[data-component='category-button']").first()).toHaveCSS(
      "pointer-events",
      "none"
    );
    // The loading hint is shown.
    await expect(page.locator("[data-category-hint]")).toContainText("Loading questions");
  });
});

test.describe("Phone — open steal (item 3): eligible stealer sees answer grid simultaneously", () => {
  test("stealAnswer: Pixel (p2, eligible, non-active) sees the full answer grid with 'Steal it — tap fast!' label", async ({
    page
  }) => {
    await gotoPhone(page, "stealAnswer");
    // The phone-answer component must be visible — the eligible stealer gets the grid at the same time
    await expect(page.locator("[data-component='phone-answer']")).toBeVisible();
    // 4 answer buttons present
    await expect(page.locator("[data-component='answer-button']")).toHaveCount(4);
    // Label indicating this is a steal opportunity (data-phone-label in PhoneAnswer)
    await expect(page.locator("[data-phone-label]")).toContainText("Steal it");
  });

  test("stealLeadIn (item 3): during the lead-in the grid is rendered but DISABLED with a 'get ready' countdown", async ({
    page
  }) => {
    await gotoPhone(page, "stealLeadIn");
    // The grid renders on every eligible phone at the same time…
    await expect(page.locator("[data-component='phone-answer']")).toBeVisible();
    await expect(page.locator("[data-component='answer-button']")).toHaveCount(4);
    // …but is marked arming and every button is disabled (dim) so no one can tap before the others.
    await expect(page.locator("[data-component='phone-answer']")).toHaveAttribute(
      "data-arming",
      "true"
    );
    await expect(page.locator("[data-component='answer-button'][data-state='dim']")).toHaveCount(4);
    await expect(page.locator("[data-phone-label]")).toContainText("Get ready to steal");
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

// ─── Non-active player watcher screen functional tests ───────────────────────────────────

test.describe("Phone — language vote (non-active watcher)", () => {
  test("all players see the PhoneLanguageVote screen with vote buttons and tally", async ({
    page
  }) => {
    await gotoPhone(page, "languageVoteWatcher");
    // All players vote (including non-active ones); the vote screen should be visible.
    await expect(page.locator("[data-component='phone-language-vote']")).toBeVisible();
    // Two language vote buttons (English + Russian)
    await expect(page.locator("[data-vote-buttons] button")).toHaveCount(2);
    // Leading tally line is visible
    await expect(page.locator("[data-wait-hint]")).toBeVisible();
  });
});

test.describe("Phone — round intro watcher (C1)", () => {
  test("non-active player sees the 'Round N · Get ready…' wait card during roundIntro", async ({
    page
  }) => {
    await gotoPhone(page, "roundIntroWatcher");
    // All phones see the same round intro wait card
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("Round");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("ready");
  });
});

test.describe("Phone — category pick watcher (non-active)", () => {
  test("non-active player sees '{name} is picking… / Watch the TV!' card", async ({ page }) => {
    await gotoPhone(page, "categoryPickWatcher");
    // Pixel (p2) is non-active — sees the waiting card with Mochi's name
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("Mochi");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("picking");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("TV");
  });
});

test.describe("Phone — question watcher (non-answering)", () => {
  test("non-answering player sees '{name} is answering / Watch the TV — you might steal it!'", async ({
    page
  }) => {
    await gotoPhone(page, "questionWatcher");
    // Pixel (p2) is not answering — sees the watcher waiting card naming the answerer (Mochi)
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("Mochi");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("answering");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("steal");
  });
});

test.describe("Phone — reveal watcher (non-answerer)", () => {
  test("non-answerer during reveal sees 'Revealing… / Watch the TV' card", async ({ page }) => {
    await gotoPhone(page, "revealWatcher");
    // Pixel (p2) did not answer (p1 answered) — sees the watcher reveal card
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("Revealing");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("TV");
  });
});

test.describe("Phone — left screen", () => {
  test("player who left sees 'You left the game / Thanks for playing!' card", async ({ page }) => {
    await gotoPhone(page, "left");
    // state.left=true renders the "You left" card — no leave modal, no reveal flash
    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("left");
    await expect(page.locator("[data-component='phone-waiting-card']")).toContainText("playing");
    // Controller must be in final phase (design: the left card reuses the data-phase="final" wrapper)
    await expect(page.locator("[data-controller]")).toHaveAttribute("data-phase", "final");
  });
});

// ─── Item 4: the phone's OWN connectivity banner (connection lost / reconnecting) ─────────

test.describe("Phone — connection banner (item 4 connectivity audit)", () => {
  test("in-flight reconnect shows a LIGHTWEIGHT, non-blocking strip (mirrors the TV's D3 strip)", async ({
    page
  }) => {
    await gotoPhone(page, "connectionReconnecting");
    const banner = page.locator("[data-component='phone-connection-banner']");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-retrying", "true");
    await expect(banner.locator("[data-label]")).toContainText("Reconnecting");
    await expect(banner.locator("[data-spinner]")).toBeVisible();
    await expect(banner.locator("[data-btn='amber']")).toHaveCount(0);
    // The strip must be NON-blocking — pointer-events:none — so it never intercepts a tap on the
    // screen underneath during a transient blip (regression guard: this exact bug blocked the join
    // wizard's Next button during normal WebRTC negotiation before the fix).
    await expect(banner).toHaveCSS("pointer-events", "none");
    await expect(page.locator("[data-controller]")).toBeVisible();
  });

  test("a settled drop shows a BLOCKING 'Connection lost' takeover with a Retry button", async ({
    page
  }) => {
    await gotoPhone(page, "connectionLost");
    const banner = page.locator("[data-component='phone-connection-banner']");
    await expect(banner).toBeVisible();
    await expect(banner).not.toHaveAttribute("data-retrying", "true");
    // The settled state IS deliberately blocking (the player must act) — not pointer-events:none.
    await expect(banner).not.toHaveCSS("pointer-events", "none");
    await expect(banner.locator("[data-title]")).toContainText("Connection lost");
    await expect(banner.locator("[data-spinner]")).toHaveCount(0);
    const retryButton = banner.locator("[data-btn='amber']");
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toContainText("Retry");
  });
});

// ─── Visual baselines (all at 390×844 — phone-chromium + phone-webkit projects) ──────

const PHONE_SCREENS: ReadonlyArray<{ phase: PhonePhaseKey; shot: string }> = [
  { phase: "waiting", shot: "phone-waiting.png" },
  // Round→score transition card (every phone shows this during the interstitial scoreboard).
  { phase: "scoreboard", shot: "phone-scoreboard.png" },
  { phase: "categoryPick", shot: "phone-category.png" },
  // categoryReveal beat: chosen button lit + others faded
  { phase: "categoryReveal", shot: "phone-category-reveal.png" },
  // categoryLoading: bank-not-ready wait — buttons dimmed + "Loading questions…" hint
  { phase: "categoryLoading", shot: "phone-category-loading.png" },
  { phase: "answer", shot: "phone-answer.png" },
  { phase: "answerLocked", shot: "phone-answer-locked.png" },
  // Item 3: open steal — eligible stealer simultaneously gets the answer grid
  { phase: "stealAnswer", shot: "phone-steal-answer.png" },
  // Item 3: pre-steal lead-in — grid rendered but disabled with a "get ready" countdown
  { phase: "stealLeadIn", shot: "phone-steal-lead-in.png" },
  { phase: "reveal", shot: "phone-reveal-flash.png" },
  { phase: "revealWrong", shot: "phone-reveal-wrong.png" },
  { phase: "final", shot: "phone-final.png" },
  { phase: "leaveModal", shot: "phone-leave-modal.png" },
  { phase: "midJoin", shot: "phone-mid-join.png" },
  // Non-active player watcher screens (newly baselined)
  { phase: "languageVoteWatcher", shot: "phone-language-vote-watcher.png" },
  { phase: "roundIntroWatcher", shot: "phone-round-intro-watcher.png" },
  { phase: "categoryPickWatcher", shot: "phone-category-pick-watcher.png" },
  { phase: "questionWatcher", shot: "phone-question-watcher.png" },
  { phase: "revealWatcher", shot: "phone-reveal-watcher.png" },
  { phase: "left", shot: "phone-left.png" },
  // Item 4 (connectivity audit): the phone's own connection banner (new baselines)
  { phase: "connectionReconnecting", shot: "phone-connection-reconnecting.png" },
  { phase: "connectionLost", shot: "phone-connection-lost.png" }
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

// ─── /code entry page (join-by-code box) ─────────────────────────────────────────────────

test.describe("Phone — /code entry page (join-by-code box)", () => {
  test("functional: /code shows the code-entry box with input and Join button", async ({
    page
  }) => {
    await page.goto("/code");
    await page.waitForSelector("[data-component='code-entry']", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator("[data-component='code-entry']")).toBeVisible();
    await expect(page.locator("[data-code-input]")).toBeVisible();
    // Join button is present (disabled until code typed)
    await expect(
      page.locator("[data-component='code-entry'] [data-component='clay-button']")
    ).toBeVisible();
    // No stage or controller island (just the entry box)
    expect(await page.locator("[data-island='stage']").count()).toBe(0);
    expect(await page.locator("[data-controller]").count()).toBe(0);
  });

  test("visual: /code entry page baseline", async ({ page }) => {
    await page.goto("/code");
    await page.waitForSelector("[data-component='code-entry']", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("phone-code-entry.png", {
      fullPage: false,
      animations: "disabled"
    });
  });
});
