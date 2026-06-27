/**
 * @file Full-match simulation — ONE TV + TWO phone controllers play all 12 rounds end-to-end over real
 * WebRTC (Hub DO signalling), exercising the whole match flow: join → language vote → 12 × (round intro →
 * category pick by the rotating active player → answer → steal → reveal → scoreboard) → final podium.
 *
 * This is the deepest integration test: it proves the live game actually progresses through a complete
 * match (the regression that mattered — `match.phase` advancing through reveal → scoreboard → next round —
 * is exercised 12 times here, not once). It is phase-driven (waits on `[data-stage][data-phase]`, never
 * fixed sleeps) and answers on whichever phone is the current answerer, so the steal hand-off is handled
 * naturally. Skips gracefully if the Hub DO / WebRTC is unavailable in this environment.
 *
 * Requires the harness server (TRIVIA_E2E=1): `/` and `/controller/<code>` (no `?e2ephase=`) boot the REAL
 * app — the fixture harness only intercepts `?e2ephase=` URLs.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

const CONNECT_TIMEOUT = 30_000;
const PHASE_TIMEOUT = 25_000;
const ROUNDS = 12;

/** Read the stage's current `data-phase` (or null if the stage isn't mounted). */
async function stagePhase(tv: Page): Promise<string | null> {
  const stage = tv.locator("[data-stage]").first();
  if (!(await stage.count())) return null;
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Playwright Locator, not a DOM node
  return stage.getAttribute("data-phase");
}

/** Poll the TV lobby for a real room code (the Hub DO allocated the room). Empty string if none. */
async function readRoomCode(tv: Page): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const el = tv.locator("[data-code]").first();
    if (await el.count()) {
      const text = ((await el.textContent()) ?? "").trim();
      if (text && text !== "····" && text.length >= 6) return text;
    }
    await tv.waitForTimeout(1000);
  }
  return "";
}

/** Complete the 3-step join wizard (name → avatar → colour → join) on a phone. */
async function joinPhone(phone: Page, code: string, name: string): Promise<void> {
  await phone.goto(`/controller/${code}`);
  await phone.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });
  const nameInput = phone.locator("[data-name-input]");
  if (await nameInput.count()) await nameInput.fill(name);
  // Three taps of "Next ▸" / "Join Game ▸" (avatar + colour pre-selected).
  await phone.locator("button[data-next]").click();
  await phone.locator("button[data-next]").click();
  await phone.locator("button[data-next]").click();
  await phone.waitForSelector("[data-controller][data-phase='lobby']", {
    timeout: CONNECT_TIMEOUT
  });
}

/** Tap a category on whichever phone is the active picker. Returns true if a pick was made. */
async function pickCategory(phones: Page[]): Promise<boolean> {
  for (let attempt = 0; attempt < 18; attempt++) {
    for (const p of phones) {
      const btn = p
        .locator("[data-component='phone-category'] button, [data-category-btn]")
        .first();
      if ((await btn.count()) && (await btn.isVisible().catch(() => false))) {
        await btn.click().catch(() => undefined);
        return true;
      }
    }
    await phones[0]?.waitForTimeout(800);
  }
  return false;
}

/**
 * Drive the answer + (possible) steal: click an answer slot on whichever phone currently shows live
 * answer buttons, looping until the TV leaves the `question` phase (resolved into `reveal`). Each phone
 * locks at most once (post-lock the buttons go inert), so the loop naturally answers the active player
 * then the stealer.
 */
async function answerUntilResolved(tv: Page, phones: Page[]): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await stagePhase(tv)) !== "question") return;
    for (const p of phones) {
      const btn = p.locator("[data-answer-grid-phone] button[data-slot]").first();
      const live =
        (await btn.count()) &&
        (await btn.isVisible().catch(() => false)) &&
        (await btn.isEnabled().catch(() => false));
      if (live) {
        await btn.click().catch(() => undefined);
        break;
      }
    }
    await tv.waitForTimeout(1200);
  }
}

/** Play one full round: category pick → answer/steal → reveal → scoreboard (or final on the last round). */
async function playRound(tv: Page, phones: Page[], round: number): Promise<void> {
  // roundIntro auto-advances to categoryPick; tolerate starting in either.
  await tv.waitForSelector(
    "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick']",
    { timeout: PHASE_TIMEOUT }
  );
  await tv.waitForSelector("[data-stage][data-phase='categoryPick']", { timeout: PHASE_TIMEOUT });

  expect(
    await pickCategory(phones),
    `round ${round}: a phone should be the active category picker`
  ).toBe(true);

  await tv.waitForSelector("[data-stage][data-phase='question']", { timeout: PHASE_TIMEOUT });
  await answerUntilResolved(tv, phones);

  // The host clock advances reveal → scoreboard; on the final round it ends at the podium instead.
  await tv.waitForSelector("[data-stage][data-phase='reveal']", { timeout: PHASE_TIMEOUT });
  if (round < ROUNDS) {
    await tv.waitForSelector("[data-stage][data-phase='scoreboard']", { timeout: PHASE_TIMEOUT });
  }
}

/** Attach a console/page-error collector to a page; returns the (mutable) error list. */
function trackErrors(page: Page, label: string): string[] {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", m => {
    if (m.type() === "error") errors.push(`[${label}] console.error: ${m.text()}`);
  });
  return errors;
}

test.describe("full match — 1 TV + 2 phones play all 12 rounds", () => {
  test.setTimeout(360_000);

  test("a complete 12-round match reaches the podium with no runtime errors", async ({
    browser
  }: {
    browser: Browser;
  }) => {
    const tvCtx = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" });
    const phoneOpts = {
      viewport: { width: 390, height: 844 },
      colorScheme: "dark" as const,
      reducedMotion: "reduce" as const,
      hasTouch: true
    };
    const p1Ctx = await browser.newContext(phoneOpts);
    const p2Ctx = await browser.newContext(phoneOpts);

    const tv = await tvCtx.newPage();
    const p1 = await p1Ctx.newPage();
    const p2 = await p2Ctx.newPage();
    const errors = [...trackErrors(tv, "tv"), ...trackErrors(p1, "p1"), ...trackErrors(p2, "p2")];

    try {
      // --- TV boots, allocate the room ---
      await tv.goto("/");
      await tv.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
      const code = await readRoomCode(tv);
      if (!code) {
        test.skip(
          true,
          "Hub DO unavailable (no room code) — cannot run the live match in this env"
        );
        return;
      }

      // --- Both phones join ---
      await joinPhone(p1, code, "Ari");
      await joinPhone(p2, code, "Bo");
      await expect(
        tv.locator("[data-player-grid] [data-component='player-tile']:not([data-empty])")
      ).toHaveCount(2, { timeout: CONNECT_TIMEOUT });

      // --- Host (p1, first joiner) starts the match ---
      const startBtn = p1.locator("button").filter({ hasText: /start\s*game/i });
      await expect(startBtn).toBeVisible({ timeout: PHASE_TIMEOUT });
      await startBtn.click();

      // --- Language vote: both pick English (auto-confirms on all-voted or timeout) ---
      await tv.waitForSelector("[data-stage][data-phase='languageVote']", {
        timeout: PHASE_TIMEOUT
      });
      for (const p of [p1, p2]) {
        const en = p
          .locator("button")
          .filter({ hasText: /english/i })
          .first();
        if (await en.count()) await en.click().catch(() => undefined);
      }

      // --- Play all 12 rounds ---
      for (let round = 1; round <= ROUNDS; round++) {
        await playRound(tv, [p1, p2], round);
      }

      // --- Final podium on the TV; final cards on the phones ---
      await tv.waitForSelector("[data-stage][data-phase='final']", { timeout: PHASE_TIMEOUT });
      await expect(tv.locator("[data-component='stage-podium']")).toBeVisible();
      // Two players → two podium blocks (1st + 2nd); the podium shows the top min(players, 3).
      await expect(tv.locator("[data-podium-stage] [data-component='podium-block']")).toHaveCount(
        2
      );
      for (const p of [p1, p2]) {
        await expect(p.locator("[data-component='phone-final']")).toBeVisible({
          timeout: PHASE_TIMEOUT
        });
      }

      expect(errors, `runtime errors during the match:\n${errors.join("\n")}`).toEqual([]);
    } finally {
      await tvCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });
});
