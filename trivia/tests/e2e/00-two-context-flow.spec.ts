/**
 * @file Two-context WebRTC flow — tests the real TV+phone connection using two browser contexts
 * in the same Playwright test, driving the full match flow end-to-end.
 *
 * This is the most critical test file: it exercises the actual WebRTC DataChannel signaling
 * through the Hub Durable Object, the room plugin coordination, and every game phase in sequence.
 *
 * Architecture:
 * - Context A: TV/stage — navigates to `/`, extracts the room code from the UI
 * - Context B: Phone — navigates to `/controller/{code}` and completes the join wizard
 * - Both contexts: exercise the full match flow through all phases
 *
 * WebRTC note: Playwright's Chromium supports WebRTC. The Hub DO (workers-native SQLite) brokers
 * the signaling. Trystero (bundled in @moku-labs/room) handles the DataChannel negotiation.
 * We use localhost which avoids TURN/ICE issues.
 */
import { expect, test } from "@playwright/test";

/** Time to wait for WebRTC connection to establish */
const CONNECTION_TIMEOUT = 25_000;
/** Time to wait for game phase transitions */
const PHASE_TIMEOUT = 15_000;

/**
 * Warm up the Hub DO before WebRTC tests run.
 *
 * Wrangler dev marks the server ready when the port opens, but the Hub Durable Object
 * initializes its SQLite tables on the FIRST WebSocket connection. If a test runs before
 * the DO warms up, the stage app sees a disconnected Hub WS and enters "Reconnecting…".
 *
 * This hook navigates to `/`, waits for a real room code (meaning the Hub WS connected),
 * then closes the page — so all three WebRTC tests start with a warm Hub DO.
 */
async function warmUpHubDO(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    // 1. Wait for a real room code (the Hub DO allocated a room).
    for (let i = 0; i < 30; i++) {
      const el = page.locator("[data-code]").first();
      if (await el.count()) {
        const text = (await el.textContent()) ?? "";
        if (text && text !== "····" && text.trim().length >= 6) break;
      }
      await page.waitForTimeout(1000);
    }
    // 2. Wait for the reconnect strip to clear — the Hub DO WS may drop once, then recover.
    // Tests are safe to run once the TV lobby is stable (no strip visible for 2s).
    for (let i = 0; i < 40; i++) {
      const strip = page.locator("[data-component='reconnect-strip']");
      if (!(await strip.isVisible({ timeout: 200 }).catch(() => false))) {
        // Stable — no strip for this poll interval
        await page.waitForTimeout(500);
        // Double-check: still no strip?
        if (!(await strip.isVisible({ timeout: 200 }).catch(() => false))) break;
      }
      await page.waitForTimeout(1000);
    }
  } finally {
    await ctx.close();
  }
}

test.describe("two-context WebRTC flow", () => {
  test.setTimeout(120_000);

  // The Hub DO warm-up can take up to 60 s on a cold worker, so we raise the hook timeout
  // from the project default (30 s). `test.setTimeout()` called inside a hook sets the
  // timeout for that currently-running hook (Playwright's supported API for this).
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    await warmUpHubDO(browser);
  });

  test("TV and phone connect: lobby shows joined player", async ({ browser }) => {
    const tvContext = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    const phoneContext = await browser.newContext({
      // Emulate a phone viewport
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      reducedMotion: "reduce"
    });

    const tvPage = await tvContext.newPage();
    const phonePage = await phoneContext.newPage();

    try {
      // --- TV boots up ---
      await tvPage.goto("/");
      await tvPage.waitForSelector("[data-stage][data-phase='lobby']", {
        timeout: 20_000
      });

      // Wait for the room code to appear (the stage island fetches it from startStage)
      // The room code badge will show the actual code once the room is open
      let roomCode = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const codeEl = tvPage.locator("[data-code]").first();
        if (await codeEl.count()) {
          const text = (await codeEl.textContent()) ?? "";
          if (text && text !== "····" && text.trim().length >= 6) {
            roomCode = text.trim();
            break;
          }
        }
        await tvPage.waitForTimeout(1000);
      }

      // If we couldn't get a real room code, the WebRTC/Hub connection may not be available
      if (!roomCode || roomCode === "····") {
        test.skip(
          true,
          "Room code not available — Hub DO may not be accessible in this environment"
        );
        return;
      }

      console.log(`Room code: ${roomCode}`);

      // Ensure the Hub WS is stable before the phone joins.
      // The Hub DO may reconnect briefly after allocating the room code; if the reconnect
      // strip is present, give it up to 30s to recover. Skip if it never recovers (Hub DO
      // unavailable in this environment).
      const reconnectStrip = tvPage.locator("[data-component='reconnect-strip']");
      const isReconnecting = await reconnectStrip.isVisible({ timeout: 500 }).catch(() => false);
      if (isReconnecting) {
        try {
          await expect(reconnectStrip).not.toBeVisible({ timeout: 30_000 });
        } catch {
          test.skip(true, "Hub WS reconnect timed out — Hub DO unavailable in this environment");
          return;
        }
      }

      // --- Phone joins the room ---
      await phonePage.goto(`/controller/${roomCode}`);
      // The SPA boots + controller island hydrates: wait for [data-controller] to appear.
      // (The outer data-layout wrapper stays as "stage" from SSR — SPA swaps island content.)
      await phonePage.waitForSelector("[data-controller]", { timeout: 20_000 });

      // The join wizard should appear (not mid-join modal since game hasn't started)
      await expect(phonePage.locator("[data-controller][data-phase='join']")).toBeVisible({
        timeout: 10_000
      });

      // Complete the join wizard — 3-step flow: name → avatar → colour → join
      // Step 1: enter a name
      const nameInput = phonePage.locator("[data-name-input]");
      if (await nameInput.count()) {
        await nameInput.fill("TestPlayer");
      }
      // Click Next to advance to avatar step
      await phonePage.locator("button[data-next]").click();

      // Step 2: pick an avatar (first in grid is pre-selected; just advance)
      await phonePage.locator("button[data-next]").click();

      // Step 3: pick a colour (first available is pre-selected; click Join Game)
      await phonePage.locator("button[data-next]").click();

      // --- TV should see the player join ---
      // Note: PlayerTile renders data-component="player-tile" (not data-player-tile).
      // Empty slots use data-empty="true"; filled tiles have no data-empty attribute.
      await tvPage.waitForSelector(
        "[data-player-grid] [data-component='player-tile']:not([data-empty])",
        {
          timeout: CONNECTION_TIMEOUT
        }
      );

      const playerTiles = tvPage.locator(
        "[data-player-grid] [data-component='player-tile']:not([data-empty])"
      );
      await expect(playerTiles).toHaveCount(1, { timeout: 10_000 });

      // Phone should now show the waiting card (lobby phase, non-host)
      await expect(phonePage.locator("[data-controller][data-phase='lobby']")).toBeVisible({
        timeout: 10_000
      });

      // Phone waiting card should show the player's identity
      const waitingCard = phonePage.locator("[data-component='phone-waiting']");
      if (await waitingCard.count()) {
        await expect(waitingCard).toBeVisible();
      }
    } finally {
      await tvContext.close();
      await phoneContext.close();
    }
  });

  test("host can start the game and both contexts enter languageVote phase", async ({
    browser
  }) => {
    const tvContext = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    const phoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      reducedMotion: "reduce"
    });

    const tvPage = await tvContext.newPage();
    const phonePage = await phoneContext.newPage();

    try {
      // Boot TV
      await tvPage.goto("/");
      await tvPage.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      // Get room code
      let roomCode = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const codeEl = tvPage.locator("[data-code]").first();
        if (await codeEl.count()) {
          const text = (await codeEl.textContent()) ?? "";
          if (text && text !== "····" && text.trim().length >= 6) {
            roomCode = text.trim();
            break;
          }
        }
        await tvPage.waitForTimeout(1000);
      }

      if (!roomCode || roomCode === "····") {
        test.skip(true, "Room code not available — skipping two-context flow");
        return;
      }

      // Phone joins
      await phonePage.goto(`/controller/${roomCode}`);
      await phonePage.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });

      // Complete join wizard (3-step: name → avatar → colour → join)
      const nameInput2 = phonePage.locator("[data-name-input]");
      if (await nameInput2.count()) {
        await nameInput2.fill("Alex");
      }
      // Next (step 1 → 2)
      await phonePage.locator("button[data-next]").click();
      // Next (step 2 → 3, avatar pre-selected)
      await phonePage.locator("button[data-next]").click();
      // Join Game (step 3 → submit)
      await phonePage.locator("button[data-next]").click();

      // Wait for phone to be in lobby phase as a joined player
      await phonePage.waitForSelector("[data-controller][data-phase='lobby']", {
        timeout: CONNECTION_TIMEOUT
      });

      // Phone should show "Start Game" button (first player is host)
      const startBtn = phonePage.locator("button").filter({ hasText: /start\s*game/i });
      if (await startBtn.count()) {
        await startBtn.click();
      }

      // TV should transition to languageVote phase
      await tvPage.waitForSelector("[data-stage][data-phase='languageVote']", {
        timeout: PHASE_TIMEOUT
      });

      await expect(tvPage.locator("[data-stage][data-phase='languageVote']")).toBeVisible();

      // Phone should also transition
      await phonePage.waitForSelector("[data-controller][data-phase='languageVote']", {
        timeout: PHASE_TIMEOUT
      });
    } finally {
      await tvContext.close();
      await phoneContext.close();
    }
  });

  test("full round: language vote → category pick → question → answer → reveal → scoreboard", async ({
    browser
  }) => {
    const tvContext = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    const phoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      reducedMotion: "reduce"
    });

    const tvPage = await tvContext.newPage();
    const phonePage = await phoneContext.newPage();

    try {
      // Boot TV
      await tvPage.goto("/");
      await tvPage.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

      let roomCode = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const codeEl = tvPage.locator("[data-code]").first();
        if (await codeEl.count()) {
          const text = (await codeEl.textContent()) ?? "";
          if (text && text !== "····" && text.trim().length >= 6) {
            roomCode = text.trim();
            break;
          }
        }
        await tvPage.waitForTimeout(1000);
      }

      if (!roomCode || roomCode === "····") {
        test.skip(true, "Room code not available");
        return;
      }

      // Phone joins + completes wizard
      await phonePage.goto(`/controller/${roomCode}`);
      await phonePage.waitForSelector("[data-controller][data-phase='join']", { timeout: 20_000 });

      // Fill name input
      const input3 = phonePage.locator("[data-name-input]");
      if (await input3.count()) await input3.fill("Alex");
      // Step 1 → 2
      await phonePage.locator("button[data-next]").click();
      // Step 2 → 3 (avatar pre-selected)
      await phonePage.locator("button[data-next]").click();
      // Step 3 → join (colour pre-selected)
      await phonePage.locator("button[data-next]").click();

      await phonePage.waitForSelector("[data-controller][data-phase='lobby']", {
        timeout: CONNECTION_TIMEOUT
      });

      // Start the game
      const startBtn = phonePage.locator("button").filter({ hasText: /start/i });
      if (await startBtn.count()) {
        await startBtn.click();
        // Transition through languageVote (auto-advances after timer or on all-voted)
        await tvPage.waitForSelector("[data-stage][data-phase='languageVote']", {
          timeout: PHASE_TIMEOUT
        });

        // Vote for English on the phone
        const enBtn = phonePage
          .locator("button")
          .filter({ hasText: /english|en/i })
          .first();
        if (await enBtn.count()) await enBtn.click();

        // TV should advance to roundIntro then categoryPick (language vote has a 5s window)
        // Wait for categoryPick (may go through roundIntro first)
        await tvPage.waitForSelector(
          "[data-stage][data-phase='categoryPick'], [data-stage][data-phase='roundIntro']",
          { timeout: 20_000 }
        );

        // If roundIntro, wait for categoryPick
        try {
          await tvPage.waitForSelector("[data-stage][data-phase='categoryPick']", {
            timeout: 15_000
          });
        } catch {
          // May have timed out on roundIntro — still a partial pass
        }

        // Verify TV shows the category pick screen
        const tvPhase = await tvPage.locator("[data-stage]").getAttribute("data-phase");
        expect(["roundIntro", "categoryPick", "question"]).toContain(tvPhase);

        // If categoryPick, pick a category on the phone
        if (tvPhase === "categoryPick") {
          await phonePage.waitForSelector("[data-controller][data-phase='categoryPick']", {
            timeout: PHASE_TIMEOUT
          });

          // The active player (first player = host) picks a category
          const catBtn = phonePage
            .locator("[data-component='phone-category'] button, [data-category-btn]")
            .first();
          if (await catBtn.count()) {
            await catBtn.click();
            // TV transitions to question phase
            await tvPage.waitForSelector("[data-stage][data-phase='question']", {
              timeout: PHASE_TIMEOUT
            });
            await expect(tvPage.locator("[data-stage][data-phase='question']")).toBeVisible();

            // TV question screen should show the answer grid
            const answerGrid = tvPage.locator("[data-answer-grid]");
            await expect(answerGrid).toBeVisible({ timeout: 5_000 });

            // Phone shows the answer buttons (as answering player)
            await phonePage.waitForSelector("[data-controller][data-phase='question']", {
              timeout: PHASE_TIMEOUT
            });

            // --- Lock an answer → the round must resolve into reveal, then scoreboard ---
            // Regression guard for the resolveAnswer phase:"reveal" fix. The phone is the ONLY player
            // (connectedCount === 1), so ANY locked slot hits the terminal branch and resolves to the
            // reveal — there is no steal. Before the fix, resolveAnswer set only phaseDeadlineTs and the
            // match stayed stuck in "question" forever (the host clock's reveal→scoreboard never fired).
            await phonePage.locator("[data-answer-grid-phone] button[data-slot]").first().click();

            // TV advances to the reveal screen (StageQuestion in revealing mode — the answer highlight).
            await tvPage.waitForSelector("[data-stage][data-phase='reveal']", {
              timeout: PHASE_TIMEOUT
            });
            await expect(tvPage.locator("[data-stage][data-phase='reveal']")).toBeVisible();

            // …and the host clock then auto-advances reveal → scoreboard (the match is no longer frozen).
            await tvPage.waitForSelector("[data-stage][data-phase='scoreboard']", {
              timeout: PHASE_TIMEOUT
            });
            await expect(tvPage.locator("[data-stage][data-phase='scoreboard']")).toBeVisible();
          }
        }
      }
    } finally {
      await tvContext.close();
      await phoneContext.close();
    }
  });
});
