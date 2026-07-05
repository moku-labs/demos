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
 * Requires the harness server (TRIVIA_E2E=1): `/` and `/code/<code>` (no `?e2ephase=`) boot the REAL
 * app — the fixture harness only intercepts `?e2ephase=` URLs.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";
import { joinPhone } from "./live-join";

const CONNECT_TIMEOUT = 45_000;
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

// joinPhone (recovery-aware, shared by the live-room specs) is imported from ./live-join — its
// per-attempt connect budget defaults to the same 45 s this file's CONNECT_TIMEOUT uses elsewhere.

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

// ─── Live-flow proof: the REAL scoreboard animates on a genuinely awarded round ───────
// The harness fixtures render frozen state — this proves the real app ALSO animates, over an actual
// WebRTC room with the host clock driving phase advances (no fixture, no frozen snapshot).

/**
 * How many rounds to attempt before giving up on seeing a genuine award (open steal makes it likely
 * within a handful of rounds, but never guaranteed on any single round — `answerUntilResolved` taps the
 * first available slot, which is only sometimes correct).
 */
const MAX_ROUNDS_FOR_AWARD = 8;

/** Poll the scoreboard root's `data-choreography` attribute (mirrors stage-screens.spec.ts). */
async function scoreboardChoreography(tv: Page): Promise<string | null> {
  const root = tv.locator("[data-component='stage-scoreboard']");
  if (!(await root.count())) return null;
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Playwright Locator, not a DOM node
  return root.getAttribute("data-choreography");
}

test.describe("full match — live scoreboard animation proof (motion ON)", () => {
  test.setTimeout(180_000);

  test("a genuinely awarded round animates the real scoreboard (delta → reorder → settled, no overlap)", async ({
    browser
  }: {
    browser: Browser;
  }) => {
    // Motion ON for the TV (unlike the reduced-motion contexts above) — this is the one context in the
    // suite that must observe the REAL choreography, not its reduced-motion collapse.
    const tvCtx = await browser.newContext({ colorScheme: "dark" });
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

      await joinPhone(p1, code, "Ari");
      await joinPhone(p2, code, "Bo");
      await expect(
        tv.locator("[data-player-grid] [data-component='player-tile']:not([data-empty])")
      ).toHaveCount(2, { timeout: CONNECT_TIMEOUT });

      const startBtn = p1.locator("button").filter({ hasText: /start\s*game/i });
      await expect(startBtn).toBeVisible({ timeout: PHASE_TIMEOUT });
      await startBtn.click();

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

      // Play rounds until a scoreboard shows a genuine gain badge (an actual award this round), or the
      // round budget runs out. Every round still exercises the invariants that MUST hold regardless of
      // whether it scored (unique positions, disjoint boxes) — the award-specific assertions gate on
      // `scored`.
      let scored = false;
      for (let round = 1; round <= MAX_ROUNDS_FOR_AWARD && !scored; round++) {
        await tv.waitForSelector(
          "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick']",
          { timeout: PHASE_TIMEOUT }
        );
        await tv.waitForSelector("[data-stage][data-phase='categoryPick']", {
          timeout: PHASE_TIMEOUT
        });
        expect(
          await pickCategory([p1, p2]),
          `round ${round}: a phone should be the active category picker`
        ).toBe(true);

        await tv.waitForSelector("[data-stage][data-phase='question']", { timeout: PHASE_TIMEOUT });
        await answerUntilResolved(tv, [p1, p2]);
        await tv.waitForSelector("[data-stage][data-phase='reveal']", { timeout: PHASE_TIMEOUT });
        await tv.waitForSelector("[data-stage][data-phase='scoreboard']", {
          timeout: PHASE_TIMEOUT
        });

        // The instant the scoreboard mounts, read whether THIS round awarded anyone (a `[data-gain]`
        // badge). Read as early as possible — the DOM invariants below must hold at every instant, so
        // there is no race to win here, but the scoring signal itself is only meaningful right at mount
        // (the host clock advances past `scoreboard` after `scoreboardMs`, config.ts's 3000ms).
        scored = (await tv.locator("[data-component='scoreboard-tile'] [data-gain]").count()) > 0;

        // ── Invariants that MUST hold on ANY scoreboard render (scored or not) ──
        const tiles = tv.locator("[data-component='scoreboard-tile']");
        const tileCount = await tiles.count();
        const positions: number[] = [];
        const prevPositions: number[] = [];
        const boxes: Array<{ y: number; height: number }> = [];
        for (let i = 0; i < tileCount; i++) {
          const tile = tiles.nth(i);
          const position = await tile.getAttribute("data-position");
          const prevPosition = await tile.getAttribute("data-prev-position");
          const box = await tile.boundingBox();
          expect(
            box,
            `round ${round}: every scoreboard tile must have a bounding box`
          ).not.toBeNull();
          positions.push(Number(position));
          prevPositions.push(Number(prevPosition));
          if (box) boxes.push({ y: box.y, height: box.height });
        }
        // §I1: position and prevPosition are each a permutation of 0..N−1 — never a shared slot.
        expect(
          positions.toSorted((a, b) => a - b),
          `round ${round}: data-position must be a permutation of 0..N-1`
        ).toEqual([...positions.keys()]);
        expect(
          prevPositions.toSorted((a, b) => a - b),
          `round ${round}: data-prev-position must be a permutation of 0..N-1`
        ).toEqual([...positions.keys()]);
        // Pairwise-disjoint bounding boxes — the reported overlap bug, live.
        const byTop = boxes.toSorted((a, b) => a.y - b.y);
        for (let i = 1; i < byTop.length; i++) {
          const prev = byTop[i - 1];
          const curr = byTop[i];
          if (!prev || !curr) continue;
          expect(
            curr.y,
            `round ${round}: live scoreboard tiles must not overlap vertically`
          ).toBeGreaterThanOrEqual(prev.y + prev.height - 1);
        }

        if (scored) {
          // ── This round genuinely scored — prove the choreography walks the full sequence with
          // motion on, and that at least one tile's prev/position pair actually differs (a mover). ──
          const hasMover = positions.some((p, i) => p !== prevPositions[i]);
          if (hasMover) {
            // A mover exists — the choreography must be observed running (not stuck at reduced-motion's
            // instant "settled"). It may already have advanced past "delta" by the time we poll (real
            // network/render latency), so accept any of the three phases as proof motion is live, then
            // confirm it reaches "settled" before the host's scoreboardMs hold ends.
            const phase = await scoreboardChoreography(tv);
            expect(
              ["delta", "reorder", "settled"],
              `round ${round}: scoreboard must expose a valid data-choreography phase`
            ).toContain(phase);
          }
          await expect(tv.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
            "data-choreography",
            "settled",
            { timeout: 4000 }
          );
          // Once settled, every tile transform is at rest — no stuck seeded transform (§I5), live.
          const transforms = await tv
            .locator("[data-component='scoreboard-tile']")
            .evaluateAll(els => els.map(el => (el as HTMLElement).style.transform));
          for (const t of transforms) {
            if (t) expect(t).toBe("translateY(0px)");
          }
        }

        // Advance past the scoreboard hold before starting the next round (or ending the loop).
        if (!scored && round < MAX_ROUNDS_FOR_AWARD) {
          await tv
            .waitForSelector(
              "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick'], [data-stage][data-phase='final']",
              { timeout: PHASE_TIMEOUT }
            )
            .catch(() => undefined);
        }
      }

      expect(
        scored,
        `no round awarded anyone across ${MAX_ROUNDS_FOR_AWARD} rounds — cannot prove the live award/animation path (this is an environment-flakiness note, not necessarily a product bug)`
      ).toBe(true);

      expect(errors, `runtime errors during the live-flow proof:\n${errors.join("\n")}`).toEqual(
        []
      );
    } finally {
      await tvCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });
});

// ─── Live steal regression guard — the sole stealer's grid actually ENABLES (the stuck-grid bug) ──────
// Reported bug: on a real steal the eligible stealer's phone stayed on "Get ready…" forever, because the
// host's `armed` sync frame was lost and the phone waited on it. The fix times the lead-in on the phone's
// OWN clock (src/islands/controller/steal-arm.ts → PhoneAnswer's `arming`), independent of that frame.
// This drives a REAL 2-phone steal and asserts the sole stealer's grid goes arming → tappable → locks,
// exercising the live lifecycle anchor end-to-end. It can't reproduce the frame LOSS on reliable localhost
// (same reason the original bug was invisible to the suite), so the discriminating proof is the
// deterministic phone-screens `stealClockSkew` fixture; this guards the live wiring against total breakage.

/** How many rounds to attempt before giving up on ever opening a sole-stealer steal. */
const MAX_ROUNDS_FOR_STEAL = 10;

/** True once the stealer phone's REAL grid is live (no `data-arming`, at least one tappable idle tile). */
async function stealerGridEnabled(phone: Page): Promise<boolean> {
  const grid = phone.locator("[data-component='phone-answer']");
  if (!(await grid.count()) || !(await grid.isVisible().catch(() => false))) return false;
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Playwright Locator, not a DOM node
  if (await grid.getAttribute("data-arming")) return false; // still on the "Get ready…" beat
  return (await grid.locator("[data-component='answer-button'][data-state='idle']").count()) > 0;
}

test.describe("full match — live steal grid enables (the stuck-grid regression)", () => {
  test.setTimeout(180_000);

  test("a genuine steal enables the sole stealer's phone grid (arming → tappable → locks)", async ({
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
      await tv.goto("/");
      await tv.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
      const code = await readRoomCode(tv);
      if (!code) {
        test.skip(true, "Hub DO unavailable — cannot run the live steal in this env");
        return;
      }

      await joinPhone(p1, code, "Ari");
      await joinPhone(p2, code, "Bo");
      await expect(
        tv.locator("[data-player-grid] [data-component='player-tile']:not([data-empty])")
      ).toHaveCount(2, { timeout: CONNECT_TIMEOUT });

      const startBtn = p1.locator("button").filter({ hasText: /start\s*game/i });
      await expect(startBtn).toBeVisible({ timeout: PHASE_TIMEOUT });
      await startBtn.click();
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

      let stealSeen = false;
      for (let round = 1; round <= MAX_ROUNDS_FOR_STEAL && !stealSeen; round++) {
        await tv.waitForSelector(
          "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick']",
          { timeout: PHASE_TIMEOUT }
        );
        await tv.waitForSelector("[data-stage][data-phase='categoryPick']", {
          timeout: PHASE_TIMEOUT
        });
        expect(
          await pickCategory([p1, p2]),
          `round ${round}: a phone should be the active category picker`
        ).toBe(true);
        await tv.waitForSelector("[data-stage][data-phase='question']", { timeout: PHASE_TIMEOUT });

        // The active answerer's phone renders PhoneAnswer immediately; the other renders a watcher card.
        const p1Grid = p1.locator("[data-component='phone-answer']");
        const p2Grid = p2.locator("[data-component='phone-answer']");
        await Promise.race([
          p1Grid.waitFor({ timeout: PHASE_TIMEOUT }),
          p2Grid.waitFor({ timeout: PHASE_TIMEOUT })
        ]);
        const activePhone = (await p1Grid.isVisible().catch(() => false)) ? p1 : p2;
        const stealerPhone = activePhone === p1 ? p2 : p1;

        // Active player taps slot 0 (~25% correct, ~75% opens a steal for the sole stealer).
        const activeBtn = activePhone
          .locator("[data-answer-grid-phone] [data-component='answer-button'][data-slot='0']")
          .first();
        await expect(activeBtn).toBeVisible({ timeout: PHASE_TIMEOUT });
        await activeBtn.click({ timeout: 15_000 });

        // Poll the STEALER's grid: it must go live (steal opened + local lead-in elapsed) before the
        // round resolves — never the active player's grid, and phase-driven (stop when TV leaves question).
        for (let tick = 0; tick < 40 && !stealSeen; tick++) {
          if ((await stagePhase(tv)) !== "question") break;
          if (await stealerGridEnabled(stealerPhone)) stealSeen = true;
          else await tv.waitForTimeout(300);
        }

        if (stealSeen) {
          // Prove the full transition: no longer arming, a tappable tile exists, and a real tap LOCKS
          // (the exact interaction the bug denied — the grid stayed dim on "Get ready…" until a reload).
          const grid = stealerPhone.locator("[data-component='phone-answer']");
          await expect(
            grid,
            "the stealer grid must not be arming once enabled"
          ).not.toHaveAttribute("data-arming", "true");
          const idle = grid.locator("[data-component='answer-button'][data-state='idle']");
          await expect(idle.first(), "the stealer grid must expose a tappable tile").toBeVisible();
          await idle.first().click({ timeout: 10_000 });
          await expect(
            grid.locator("[data-component='answer-button'][data-state='locked']"),
            "the stealer's tap must lock a tile — not silently no-op"
          ).toHaveCount(1, { timeout: 5000 });
        } else {
          // No steal this round (active player was right, or the window closed) — drain to the next round.
          await tv
            .waitForSelector(
              "[data-stage][data-phase='reveal'], [data-stage][data-phase='scoreboard'], [data-stage][data-phase='final']",
              { timeout: PHASE_TIMEOUT }
            )
            .catch(() => undefined);
          if (round < MAX_ROUNDS_FOR_STEAL) {
            await tv
              .waitForSelector(
                "[data-stage][data-phase='roundIntro'], [data-stage][data-phase='categoryPick'], [data-stage][data-phase='final']",
                { timeout: PHASE_TIMEOUT }
              )
              .catch(() => undefined);
          }
        }
      }

      expect(
        stealSeen,
        `no sole-stealer steal opened across ${MAX_ROUNDS_FOR_STEAL} rounds (env flakiness — the active player kept answering correctly, not necessarily a product bug)`
      ).toBe(true);
      expect(errors, `runtime errors during the live steal proof:\n${errors.join("\n")}`).toEqual(
        []
      );
    } finally {
      await tvCtx.close();
      await p1Ctx.close();
      await p2Ctx.close();
    }
  });
});
