/**
 * @file QA regression suite — durable tests for bugs confirmed during the human-QA
 * exploratory pass. Each test pins a specific behavior that was found and verified;
 * it discriminates (goes red on the original bug, green on the fix) so the finding
 * can never silently regress.
 *
 * Charters run: 1 (TV lobby), 2 (join wizard), 4 (bad-code deep link),
 *               6 (mobile viewport), 8 (mute toggle).
 */
import { expect, test } from "@playwright/test";

// ─── Finding R1: Missing `role="main"` landmark on TV stage ──────────────
// Oracle: Accessibility-vs-rendered mismatch (WCAG 2.4.1 — bypass blocks via landmarks).
// Evidence: `document.querySelector("main")` returned null on / and /code/* routes.
// After fix: both layouts carry `role="main"` on [data-layout].

test.describe("R1 — role=main landmark present on TV stage", () => {
  test("TV stage route has a main landmark", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });

    const mainRole = await page.evaluate(() => {
      // Check for semantic <main> or an explicit role="main"
      const semanticMain = document.querySelector("main");
      const roleMain = document.querySelector("[role='main']");
      return { semanticMain: !!semanticMain, roleMain: !!roleMain };
    });

    expect(
      mainRole.semanticMain || mainRole.roleMain,
      "TV stage must expose a main landmark for screen readers (WCAG 2.4.1)"
    ).toBeTruthy();
  });

  test("phone controller route has a main landmark", async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });

    const mainRole = await page.evaluate(() => {
      const semanticMain = document.querySelector("main");
      const roleMain = document.querySelector("[role='main']");
      return { semanticMain: !!semanticMain, roleMain: !!roleMain };
    });

    expect(
      mainRole.semanticMain || mainRole.roleMain,
      "Controller route must expose a main landmark for screen readers (WCAG 2.4.1)"
    ).toBeTruthy();
  });
});

// ─── Finding R2: [data-next] button tap target ≥44px ──────────────────────
// Oracle: WCAG 2.5.5 — Target Size (Enhanced) / implicit mobile UX standard.
// Evidence: button[data-next] rendered at 42px height on 390x844 viewport.
// After fix: [data-next] CSS has min-height:44px.

test.describe("R2 — join wizard nav button tap targets ≥44px", () => {
  test("[data-next] button is at least 44px tall on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const height = await page.evaluate(() => {
      const btn = document.querySelector("button[data-next]") as HTMLElement | null;
      return btn ? btn.getBoundingClientRect().height : -1;
    });

    expect(
      height,
      `[data-next] button must be ≥44px tall; got ${height}px (WCAG 2.5.5)`
    ).toBeGreaterThanOrEqual(44);
  });

  test("[data-back] button is at least 44px tall on mobile viewport (when visible)", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });
    // Navigate to step 2 where [data-back] appears
    await page.locator("[data-name-input]").fill("Test");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);

    const backHeight = await page.evaluate(() => {
      const btn = document.querySelector("button[data-back]") as HTMLElement | null;
      return btn ? btn.getBoundingClientRect().height : -1;
    });
    if (backHeight > 0) {
      expect(
        backHeight,
        `[data-back] button must be ≥44px tall; got ${backHeight}px (WCAG 2.5.5)`
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

// ─── Finding R3: Mute button accessible state communicates toggle ──────────
// Oracle: Accessibility-vs-rendered mismatch (WCAG 4.1.2 — name, role, value).
// Evidence: initial run showed aria-label was null (no accessible name beyond emoji icon).
// After fix: each channel pill (Music/SFX) has aria-label "<channel> on — tap to mute" /
// "<channel> muted — tap to unmute" (the first pill is Music).

test.describe("R3 — mute button accessible state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-stage][data-phase='lobby']", { timeout: 20_000 });
  });

  test("mute button has aria-label (not just text or emoji)", async ({ page }) => {
    const muteBtn = page.locator("[data-island='mute'] button").first();
    await expect(muteBtn).toBeVisible();

    const ariaLabel = await muteBtn.getAttribute("aria-label");
    expect(
      ariaLabel,
      "Mute button must have aria-label for screen readers — emoji + visual text alone is insufficient (WCAG 4.1.2)"
    ).toBeTruthy();
  });

  test("mute button aria-label changes on toggle (communicates state)", async ({ page }) => {
    const muteBtn = page.locator("[data-island='mute'] button").first();
    const initLabel = await muteBtn.getAttribute("aria-label");

    await muteBtn.click();
    await page.waitForTimeout(300);

    const afterLabel = await muteBtn.getAttribute("aria-label");
    expect(
      afterLabel,
      "aria-label must change after mute toggle (WCAG 4.1.2 — state must be communicated)"
    ).not.toBe(initLabel);
  });

  test("mute button aria-pressed reflects current state", async ({ page }) => {
    const muteBtn = page.locator("[data-island='mute'] button").first();
    const initPressed = await muteBtn.getAttribute("aria-pressed");

    await muteBtn.click();
    await page.waitForTimeout(300);

    const afterPressed = await muteBtn.getAttribute("aria-pressed");
    expect(afterPressed, "aria-pressed must change on toggle").not.toBe(initPressed);
  });
});

// ─── Finding R4: Join wizard does not advance on disabled Next ─────────────
// Oracle: Invariant — clicking a disabled control must not change state.
// Evidence: force-clicking the disabled [data-next] could fire the advance handler
// in older code. Test confirms the disabled button is correctly guarded.

test.describe("R4 — join wizard disabled guard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });
  });

  test("Next is disabled when name field is empty", async ({ page }) => {
    await expect(page.locator("button[data-next]")).toBeDisabled();
  });

  test("force-clicking disabled Next does not advance from step 1", async ({ page }) => {
    const nextBtn = page.locator("button[data-next]");
    await nextBtn.click({ force: true });
    await page.waitForTimeout(200);
    // Must still be on step 1
    await expect(page.locator("[data-step='name']")).toBeVisible();
  });

  test("Next enables once name has content", async ({ page }) => {
    await page.locator("[data-name-input]").fill("Ali");
    await expect(page.locator("button[data-next]")).toBeEnabled();
  });
});

// ─── Finding R5: Bad room code shows graceful join wizard ──────────────────
// Oracle: Implicit — no JS errors on a bad-code deep link; graceful degradation.
// Evidence: /code/BADCODE99 showed phase="join" + no JS errors.

test.describe("R5 — bad room code graceful fallback", () => {
  test("unknown room code deep link shows join wizard without JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", e => jsErrors.push(e.message));

    await page.goto("/code/BADCODE99");
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // Should show join wizard (graceful degradation to the join flow)
    await expect(page.locator("[data-component='join-wizard']")).toBeVisible();

    // Phase must be "join" (didn't crash into an unknown state)
    await expect(page.locator("[data-controller]")).toHaveAttribute("data-phase", "join");

    // No JS errors
    expect(jsErrors, `JS errors with bad room code: ${jsErrors.join(", ")}`).toHaveLength(0);
  });
});

// ─── Finding R6: Join wizard name retained on back navigation ─────────────
// Oracle: Invariant / FEW HICCUPPS history oracle — back navigation should not
// destroy user input (standard form convention).
// Evidence: navigation step1→2→back shows name input retained.

test.describe("R6 — join wizard back navigation retains name", () => {
  test("going back to step 1 retains the entered name", async ({ page }) => {
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    await page.locator("[data-name-input]").fill("Alex");
    await page.locator("button[data-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='avatar']")).toBeVisible();

    await page.locator("button[data-back]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-step='name']")).toBeVisible();

    const retainedName = await page.locator("[data-name-input]").inputValue();
    expect(
      retainedName,
      "Name must be retained after back-navigation (FEW HICCUPPS: history)"
    ).toBe("Alex");
  });
});

// ─── Finding R7: Mobile overflow — no horizontal scroll ───────────────────
// Oracle: Mobile platform oracle — horizontal overflow on a mobile-first phone UI
// is a critical layout failure.
// Evidence: bodyScrollWidth == viewportWidth on 390x844 with no overflow.

test.describe("R7 — mobile overflow guard", () => {
  test("phone surface (390x844) has no horizontal overflow on join step 1", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/code/TESTCODE");
    await page.waitForSelector("[data-component='join-wizard']", { timeout: 20_000 });

    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));

    expect(
      overflow.bodyScrollWidth,
      "Phone body must not overflow viewport (horizontal scroll not allowed)"
    ).toBeLessThanOrEqual(overflow.viewportWidth);

    expect(
      overflow.docScrollWidth,
      "Phone document must not overflow viewport"
    ).toBeLessThanOrEqual(overflow.viewportWidth);
  });
});
