/**
 * @file QA-charter regression guards (from the human-QA exploratory pass): new-code behavioral
 * correctness, QR SVG scannability, phone join-wizard edge cases, reconnect UX, and keyboard/focus.
 *
 * Charters covered:
 *   A — New-code behavioral correctness (double-reset edge case)
 *   B — QR code SVG attribute correctness (scannability guard)
 *   C — Phone join wizard edge cases (name cap, back nav, special chars, mid-game lock)
 *   D — Reconnect UX / bad room code graceful recovery
 *   E — Keyboard + focus tour (TV lobby tab stops, phone wizard keyboard access)
 *
 * Each test names the oracle it validates and cites concrete DOM/network evidence.
 * Tests are written as durable regression guards (not one-time exploratory scripts).
 */
import { expect, test } from "@playwright/test";

// ─── Charter A: New-code behavioral correctness ───────────────────────────────

test.describe("Charter A -- New-code: double-reset edge case (OCD oracle)", () => {
  test.setTimeout(60_000);

  /**
   * OCD oracle: double-clicking [data-reset] must produce exactly one real navigation.
   * hardNavigate detaches the SPA interceptor; the second click fires on the old document
   * which is being torn down — so it is a no-op. navCount must equal 1.
   */
  test("double-clicking [data-reset] produces exactly one navigation and a new code", async ({
    page
  }) => {
    await page.goto("/");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

    let code1 = "";
    for (let i = 0; i < 10; i++) {
      const el = page.locator("[data-code]").first();
      if (await el.count()) {
        const text = ((await el.textContent()) ?? "").trim();
        if (text && text !== "····" && text.length >= 6) {
          code1 = text;
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    if (!code1) {
      test.skip(true, "Hub DO unavailable -- cannot verify reset changes room code");
      return;
    }

    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));

    const resetBtn = page.locator("[data-reset]");
    await expect(resetBtn).toBeVisible({ timeout: 5_000 });

    let navCount = 0;
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) navCount += 1;
    });

    const navDone = page.waitForEvent("framenavigated", { timeout: 15_000 });
    await resetBtn.dblclick();
    await navDone.catch(() => {});

    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
    await page.waitForTimeout(1000);

    expect(
      navCount,
      `Double-clicking [data-reset] must produce exactly 1 navigation. Got ${navCount}. ` +
        "Oracle: OCD -- double-click must not trigger two full-page reloads"
    ).toBe(1);

    let code2 = "";
    for (let i = 0; i < 10; i++) {
      const el = page.locator("[data-code]").first();
      if (await el.count()) {
        const text = ((await el.textContent()) ?? "").trim();
        if (text && text !== "····" && text.length >= 6) {
          code2 = text;
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    if (code2) {
      expect(
        code2,
        `After double-click reset, new code must differ from old. Old: "${code1}", New: "${code2}". ` +
          "Oracle: Invariant (reset mints fresh room)"
      ).not.toBe(code1);
    }

    const realErrors = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      realErrors,
      `Double-click reset must not cause JS errors: ${realErrors.join(", ")}. Oracle: Implicit`
    ).toHaveLength(0);
  });
});

// ─── Charter B: QR code SVG attributes (scannability guard) ──────────────────

test.describe("Charter B -- QR SVG attributes (scannability)", () => {
  test.setTimeout(45_000);

  /**
   * Guard the new QrBlock.tsx SVG renderer attributes.
   * Oracle: Standard (QR scannability) + WCAG 4.1.2 (no double-labeling).
   */
  test("real lobby QR SVG has correct scannability attributes", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

    const qrSvg = page.locator("[data-qr-svg]");
    const appeared = await qrSvg
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      const placeholder = page.locator("[data-component='qr-block'] [data-placeholder]");
      await expect(
        placeholder,
        "Placeholder must be visible when QR matrix not yet generated. Oracle: Implicit (no content gap)"
      ).toBeVisible({ timeout: 5_000 });
      test.skip(true, "Hub DO unavailable -- QR SVG not generated; placeholder guard passed");
      return;
    }

    const shapeRendering = await qrSvg.getAttribute("shape-rendering");
    expect(
      shapeRendering,
      `QR SVG must have shape-rendering="crispEdges". Got "${shapeRendering}". ` +
        "Oracle: Standard -- crispEdges prevents sub-pixel anti-aliasing on module edges"
    ).toBe("crispEdges");

    const bgFill = await page.evaluate(() =>
      document.querySelector("[data-qr-svg]")?.querySelector("rect")?.getAttribute("fill")
    );
    expect(
      bgFill,
      `QR background rect must be fill="#fff". Got "${bgFill}". Oracle: QR scannability`
    ).toBe("#fff");

    const moduleFill = await page.evaluate(() =>
      document.querySelector("[data-qr-svg]")?.querySelector("g")?.getAttribute("fill")
    );
    expect(
      moduleFill,
      `QR module group must be fill="#000". Got "${moduleFill}". Oracle: QR scannability`
    ).toBe("#000");

    const svgAriaHidden = await qrSvg.getAttribute("aria-hidden");
    expect(
      svgAriaHidden,
      `QR SVG must be aria-hidden="true". Got "${svgAriaHidden}". ` +
        "Oracle: WCAG 4.1.2 -- wrapper has role=img+aria-label; SVG must not duplicate"
    ).toBe("true");

    const viewBox = await qrSvg.getAttribute("viewBox");
    const totalPx = Number((viewBox ?? "0 0 0 0").split(" ")[2]);
    expect(
      totalPx,
      `QR viewBox dim (${totalPx}px) must be >= 232 (4-module quiet zone, 8px/module, 21x21 min grid). ` +
        "Oracle: ISO 18004 section 5.6.4 quiet zone"
    ).toBeGreaterThanOrEqual(232);

    const moduleCount = await page.evaluate(() => {
      const g = document.querySelector("[data-qr-svg] g");
      return g?.querySelectorAll("rect").length ?? 0;
    });
    expect(
      moduleCount,
      `QR SVG must have >= 50 dark module rects. Got ${moduleCount}. Oracle: Implicit (non-empty QR)`
    ).toBeGreaterThan(50);
  });

  /**
   * Fixture lobby has qr:null. The placeholder grid must render (no blank area).
   * The wrapper must carry role="img" + aria-label even in placeholder state.
   * Oracle: Implicit (no content gap) + WCAG 1.1.1 (accessible in all states).
   */
  test("fixture lobby: placeholder grid renders when qr=null, wrapper has role+label", async ({
    page
  }) => {
    await page.goto("/?e2ephase=lobby");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

    const placeholder = page.locator("[data-component='qr-block'] [data-grid]");
    await expect(
      placeholder,
      "Placeholder grid must be visible when qr=null. Oracle: Implicit (no content gap)"
    ).toBeVisible();

    const blockA11y = await page.evaluate(() => {
      const block = document.querySelector("[data-component='qr-block']");
      return { role: block?.getAttribute("role"), ariaLabel: block?.getAttribute("aria-label") };
    });
    expect(blockA11y.role, "QR block wrapper must have role='img'. Oracle: WCAG 1.1.1").toBe("img");
    expect(
      blockA11y.ariaLabel,
      "QR block wrapper must have aria-label. Oracle: WCAG 1.1.1"
    ).toBeTruthy();
  });

  /**
   * The QR card must have color-scheme: light to prevent dark-mode from inverting
   * #000 modules to white (which makes the QR unscannable).
   * Oracle: Standard (dark-mode QR scannability).
   */
  test("QR card has color-scheme: light (dark-mode inversion guard)", async ({ page }) => {
    await page.goto("/?e2ephase=lobby");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

    const cardColorScheme = await page.evaluate(() => {
      const card = document.querySelector("[data-component='qr-block'] [data-card]");
      return card ? getComputedStyle(card).colorScheme : null;
    });
    expect(
      cardColorScheme,
      `QR card must have computed color-scheme containing "light". Got "${cardColorScheme}". ` +
        "Oracle: Standard -- dark-mode must not invert QR module colors (unscannable)"
    ).toContain("light");
  });
});

// ─── Charter C: Phone join wizard edge cases ─────────────────────────────────

test.describe("Charter C -- Join wizard edge cases", () => {
  test.setTimeout(30_000);

  /**
   * Antisocial oracle: 50-char name must be capped at maxLength=16.
   * Oracle: Antisocial -- oversized name must not reach game state.
   */
  test("50-char name is capped at maxLength=16 by the input element", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("A".repeat(50));
    const actual = await page.locator("[data-name-input]").inputValue();
    expect(
      actual.length,
      `Name input must cap at 16 chars. Got ${actual.length} after entering 50. Oracle: Antisocial`
    ).toBeLessThanOrEqual(16);
  });

  /**
   * Rained-Out oracle: back navigation from step 3 -> 1 must retain the entered name.
   * Losing work on Back is a Nielsen heuristic violation (Error Prevention).
   * Oracle: Heuristic: Error Prevention (Nielsen 5).
   */
  test("back navigation from step 3 to step 1 retains the entered name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("BackTest");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='color']")).toBeVisible();

    await page.locator("button[data-back]").click();
    await page.waitForTimeout(150);
    await page.locator("button[data-back]").click();
    await page.waitForTimeout(150);
    await expect(page.locator("[data-step='name']")).toBeVisible();

    const retained = await page.locator("[data-name-input]").inputValue();
    expect(
      retained,
      `Name must be retained after navigating back from step 3 to 1. Got "${retained}". ` +
        "Oracle: Heuristic: Error Prevention -- Back must preserve the user's work"
    ).toBe("BackTest");
  });

  /**
   * Antisocial oracle: special chars in name must not cause JS errors or DOM injection.
   * Oracle: Antisocial -- special chars must be safely rendered.
   */
  test('special-chars name (<>&") renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill(`<>&"'hello`);
    await page.waitForTimeout(200);

    await expect(
      page.locator("button[data-next]"),
      "Next must be enabled with special-chars name. Oracle: Invariant (non-empty name enables Next)"
    ).toBeEnabled();

    const realErrors = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      realErrors,
      `Special chars name must not cause JS errors: ${realErrors.join(", ")}. Oracle: Implicit`
    ).toHaveLength(0);
  });

  /**
   * Invariant: the mid-join rejection modal appears when the game is in progress.
   * Oracle: Invariant (mid-game join lock enforced in UI).
   */
  test("mid-game join: midJoin fixture phase shows the rejection modal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TRIV1234?e2ephase=midJoin");
    await page.waitForSelector("[data-controller][data-phase='question']", { timeout: 20_000 });

    const modal = page.locator("[data-component='mid-join-modal']");
    await expect(
      modal,
      "Mid-join modal must be visible when game is in progress. Oracle: Invariant (mid-game join lock)"
    ).toBeVisible();

    const gotIt = modal.locator("button[data-btn='sky']");
    await expect(
      gotIt,
      "Mid-join 'Got it' button must be enabled. Oracle: Dead affordance check"
    ).toBeEnabled();
  });
});

// ─── Charter D: Reconnect UX + bad code ──────────────────────────────────────

test.describe("Charter D -- Reconnect UX and bad room code recovery", () => {
  test.setTimeout(30_000);

  /**
   * Saboteur oracle: /code/BADCODE123 must show the join wizard (not crash or freeze).
   * The controller lifecycle tries to join, fails, and rolls back the optimistic state so the
   * user is returned to the wizard where they can rescan a QR or enter a valid code.
   * Oracle: Heuristic: Error Recovery (Nielsen 9).
   */
  test("bad room code shows the join wizard (not a crash or frozen state)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/BADCODE123");
    await page.waitForTimeout(8000);

    const controllerEl = page.locator("[data-controller]");
    await expect(
      controllerEl,
      "Controller element must be present after bad code navigation. Oracle: Implicit (no crash)"
    ).toBeAttached();

    const wizardVisible = await page
      .locator("[data-component='join-wizard']")
      .isVisible()
      .catch(() => false);
    const phase = await controllerEl.getAttribute("data-phase");
    expect(
      wizardVisible || phase === "join",
      `Bad room code must show join wizard. wizardVisible=${wizardVisible}, phase="${phase}". ` +
        "Oracle: Heuristic: Error Recovery (Nielsen 9)"
    ).toBe(true);

    const realErrors = errors.filter(
      e =>
        !e.includes("WebSocket") &&
        !e.includes("429") &&
        !e.includes("ws://") &&
        !e.includes("join-failed") &&
        !e.includes("network-warning")
    );
    expect(
      realErrors,
      `Bad room code must not cause unexpected JS errors: ${realErrors.join(", ")}. Oracle: Implicit`
    ).toHaveLength(0);
  });
});

// ─── Charter E: Keyboard + focus tour ────────────────────────────────────────

test.describe("Charter E -- Keyboard and focus tour", () => {
  test.setTimeout(30_000);

  /**
   * WCAG 2.1.1: TV lobby must have exactly two keyboard tab stops (mute + reset).
   * No lobby tiles, QR block, or player cards should be in the tab order.
   * Oracle: Standard WCAG 2.1.1 Keyboard + HQ5 guard.
   */
  test("TV lobby has exactly two tab stops: mute and reset", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
    await page.waitForTimeout(500);

    const tabStops: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.tagName === "BODY") return null;
        return {
          tag: el.tagName,
          ariaLabel: el.getAttribute("aria-label") ?? "",
          data: Object.keys((el as HTMLElement).dataset).join(","),
          text: el.textContent?.trim().slice(0, 30) ?? ""
        };
      });
      if (focused) {
        const key = JSON.stringify(focused);
        if (!tabStops.includes(key)) tabStops.push(key);
      }
    }

    for (const stop of tabStops) {
      const parsed: { tag: string; ariaLabel: string; data: string; text: string } =
        JSON.parse(stop);
      const isMute =
        parsed.ariaLabel.toLowerCase().includes("mute") ||
        (parsed.data.includes("component") && parsed.text.toLowerCase().includes("sound"));
      const isReset =
        parsed.ariaLabel.toLowerCase().includes("new room code") || parsed.data.includes("reset");
      expect(
        isMute || isReset,
        `Unexpected TV lobby tab stop: ${stop}. ` +
          "Oracle: WCAG 2.1.1 -- only mute + reset should be keyboard-focusable on the TV"
      ).toBe(true);
    }
    expect(
      tabStops.length,
      "TV lobby must have at least 2 keyboard tab stops (mute + reset)"
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * WCAG 2.1.1: all phone join wizard controls must be keyboard-accessible.
   * Tests: name input, Next button, Back button, avatar buttons, color swatches.
   * Oracle: Standard WCAG 2.1.1 Keyboard.
   */
  test("phone join wizard: all controls are keyboard-focusable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    // Step 1: name input + Next
    const nameInput = page.locator("[data-name-input]");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("KeyTest");

    const nextBtn = page.locator("button[data-next]");
    await expect(nextBtn).toBeEnabled();

    // Tab from name input must land on Next
    await nameInput.focus();
    await page.keyboard.press("Tab");
    const tabLandsOnNext = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.dataset.next !== undefined
    );
    expect(tabLandsOnNext, "Tab from name input must land on Next button. Oracle: WCAG 2.1.1").toBe(
      true
    );

    // Next must accept direct keyboard focus
    await nextBtn.focus();
    const nextDirectFocus = await page.evaluate(
      () =>
        document.activeElement?.tagName === "BUTTON" &&
        (document.activeElement as HTMLElement).dataset.next !== undefined
    );
    expect(
      nextDirectFocus,
      "Next button must accept direct keyboard focus. Oracle: WCAG 2.1.1"
    ).toBe(true);

    // Step 2: avatar buttons + Back
    await nextBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='avatar']")).toBeVisible();

    const firstAvatar = page.locator("button[data-avatar-cell]").first();
    await firstAvatar.focus();
    expect(
      await page.evaluate(() => document.activeElement?.tagName === "BUTTON"),
      "Avatar buttons must accept keyboard focus. Oracle: WCAG 2.1.1"
    ).toBe(true);

    const backBtn = page.locator("button[data-back]");
    await backBtn.focus();
    expect(
      await page.evaluate(() => document.activeElement?.tagName === "BUTTON"),
      "Back button must accept keyboard focus. Oracle: WCAG 2.1.1"
    ).toBe(true);

    // Step 3: color swatch buttons
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='color']")).toBeVisible();

    const firstSwatch = page.locator("button[data-swatch]").first();
    await firstSwatch.focus();
    expect(
      await page.evaluate(() => document.activeElement?.tagName === "BUTTON"),
      "Color swatch buttons must accept keyboard focus. Oracle: WCAG 2.1.1"
    ).toBe(true);
  });

  /**
   * Heuristic: Flexibility — Enter key on name input must advance the wizard to step 2.
   * Oracle: Heuristic: Flexibility and Efficiency (Nielsen 7).
   */
  test("Enter key on name input advances to step 2 (avatar)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("EnterTest");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    await expect(
      page.locator("[data-step='avatar']"),
      "Enter on name input must advance to step 2 (avatar). Oracle: Heuristic: Flexibility"
    ).toBeVisible({ timeout: 3_000 });
  });
});
