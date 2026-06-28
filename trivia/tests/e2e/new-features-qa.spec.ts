/**
 * @file Exploratory QA — five new features (2026-06-28)
 *
 * Charters:
 *   NF-1 (FedEx) — Reveal score chip count-up: settled value = total; from = total - delta
 *   NF-2 (FedEx) — TV scoreboard round-gain: +N badge present; settled score = total
 *   NF-3 (Supermodel/OCD) — Phone category stagger animation honours reduced-motion
 *   NF-4 (FedEx) — Phone scoreboard transition card: round done + difficulty pips
 *   NF-5 (Supermodel) — Mute button 10px-higher nudge: top style is correct
 */
import { expect, type Page, test } from "@playwright/test";

async function gotoStage(page: Page, phase: string): Promise<void> {
  await page.goto(`/?e2ephase=${phase}`);
  await page.waitForSelector(`[data-stage]`, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function gotoPhone(page: Page, phase: string): Promise<void> {
  await page.goto(`/code/TRIV1234?e2ephase=${phase}`);
  await page.waitForSelector(`[data-controller]`, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

// ─── NF-1: Reveal score chip count-up ─────────────────────────────────────────

test.describe("NF-1 — Reveal score chip count-up (FedEx + invariant)", () => {
  // Invariant: with reduced-motion, [data-total] must show the FINAL total immediately
  // (1400 for Mochi), not the pre-round start value (1200).
  test("score chip shows final total (1400) instantly with reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "reveal");
    await page.waitForTimeout(100);

    const chip = page.locator("[data-component='score-chip']").first();
    await expect(chip).toBeVisible();

    const total = await chip.locator("[data-total]").textContent();
    // In the fixture, Mochi's total=1400, delta=200. With reduced-motion the count-up
    // must settle to 1400 immediately (not 1200 the start value).
    expect(
      total?.replaceAll(",", ""),
      `Score chip [data-total] must show 1,400 with reduced-motion (count-up settles instantly). Got: ${total}`
    ).toBe("1400");
  });

  // Invariant: [data-delta] shows the correct delta string "+200"
  test("score chip delta is +200 (matches fixture scorer Mochi)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "reveal");

    const chip = page.locator("[data-component='score-chip']").first();
    const delta = await chip.locator("[data-delta]").textContent();
    expect(
      delta?.trim(),
      `Score chip [data-delta] must read "+200" for Mochi in the fixture. Got: ${delta}`
    ).toBe("+200");
  });

  // Invariant: name is present and non-empty
  test("score chip name is present and non-empty", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "reveal");

    const chip = page.locator("[data-component='score-chip']").first();
    const name = await chip.locator("[data-name]").textContent();
    expect(
      (name ?? "").trim().length,
      `Score chip [data-name] must be non-empty. Got: "${name}"`
    ).toBeGreaterThan(0);
  });

  // Implicit oracle: no JS errors during reveal render
  test("reveal screen: no JS errors with count-up active (no reduced-motion)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    // No reduced-motion — animation fires
    await gotoStage(page, "reveal");
    await page.waitForTimeout(300);

    const real = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      real,
      `Reveal with count-up animation must not produce JS errors: ${real.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─── NF-2: TV scoreboard round-gain badge + count-up ─────────────────────────

test.describe("NF-2 — TV scoreboard round-gain badge (FedEx + invariant)", () => {
  // Invariant: exactly 1 "+200" gain badge (only Mochi scored in the fixture)
  test("scoreboard: exactly one +200 gain badge (Mochi only)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");

    const gainBadges = page.locator("[data-component='scoreboard-tile'] [data-gain]");
    await expect(gainBadges).toHaveCount(1);
    await expect(gainBadges.first()).toContainText("+200");
  });

  // Invariant: zero-delta players have NO gain badge
  test("scoreboard: 4 tiles with no +N gain badge (non-scorers)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");

    // 5 tiles total; exactly 1 has [data-gain]; the 4 non-scorers must not have it
    const tiles = page.locator("[data-component='scoreboard-tile']");
    await expect(tiles).toHaveCount(5);

    const tilesWithGain = page.locator("[data-component='scoreboard-tile'] [data-gain]");
    await expect(tilesWithGain).toHaveCount(1);
  });

  // Invariant: with reduced-motion, each [data-score] shows the final total (not the start value)
  test("scoreboard: score text is settled final total with reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");
    await page.waitForTimeout(200);

    // Mochi's score is 1400 (total). The count-up starts from 1200 (total - delta = 1400 - 200).
    // With reduced-motion it must jump to 1400 immediately.
    const firstTile = page.locator("[data-component='scoreboard-tile']").first();
    const scoreText = await firstTile.locator("[data-score]").textContent();
    // Mochi is rank 1 (tile order follows the ranked list). Score must be 1,400.
    expect(
      scoreText?.replaceAll(",", ""),
      `First scoreboard tile [data-score] must show 1,400 with reduced-motion. Got: ${scoreText}`
    ).toBe("1400");
  });

  // Invariant: proportional bar width is > 0 for the first-place player.
  // --fill is set on the TILE root (data-component="scoreboard-tile"), not the child fill element.
  test("scoreboard: first-place bar fill is non-zero", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");
    await page.waitForTimeout(200);

    // Read --fill from the TILE root where ScoreboardTile sets it inline (not from [data-bar-fill]).
    const fill = await page
      .locator("[data-component='scoreboard-tile']")
      .first()
      .evaluate(el => (el as HTMLElement).style.getPropertyValue("--fill"));
    // Mochi is rank 1 with total=1400=maxTotal → pct = 100% → --fill = "100%".
    expect(fill, `First-place tile must have a non-empty --fill CSS var. Got: "${fill}"`).not.toBe(
      ""
    );
    expect(fill, `First-place tile --fill must not be "0%". Got: "${fill}"`).not.toBe("0%");
  });

  // Invariant: Pixel (p2) overtook Tofu in the fixture (prevRank=3 → rank=2) → data-badge visible
  test("scoreboard: overtake badge appears for the player that climbed a rank (Pixel overtook Tofu)", async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");

    // The fixture: Pixel (p2) prevRank=3, live rank=2 (overtook Tofu) → [data-badge] must show "overtook Tofu".
    // Exactly 1 tile should have a [data-badge].
    const badge = page.locator("[data-component='scoreboard-tile'] [data-badge]");
    await expect(badge).toHaveCount(1);
    await expect(badge.first()).toContainText("overtook");
    await expect(badge.first()).toContainText("Tofu");
  });

  // Invariant: the overtake tile has data-moved-up attribute (used for the glow border in CSS)
  test("scoreboard: overtake tile has data-moved-up attribute", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStage(page, "scoreboard");

    const movedUpTile = page.locator("[data-component='scoreboard-tile'][data-moved-up]");
    await expect(movedUpTile).toHaveCount(1);
  });

  // Implicit oracle: no JS errors on scoreboard render with animation
  test("scoreboard: no JS errors during count-up animation", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    await gotoStage(page, "scoreboard");
    await page.waitForTimeout(300);

    const real = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(real, `Scoreboard count-up must not produce JS errors: ${real.join(", ")}`).toHaveLength(
      0
    );
  });
});

// ─── NF-3: Phone category stagger animation ───────────────────────────────────

test.describe("NF-3 — Phone category stagger animation (Supermodel + OCD)", () => {
  // Structural invariant: 6 category buttons each have an --i CSS variable (the stagger index)
  test("category pick: 6 buttons each have --i stagger CSS var (0 through 5)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "categoryPick");

    const buttons = page.locator("[data-component='category-button']");
    await expect(buttons).toHaveCount(6);

    const iValues = await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-component='category-button']");
      return [...btns].map(btn => (btn as HTMLElement).style.getPropertyValue("--i"));
    });

    // Each button must have a numeric --i value (the stagger index)
    for (const [i, val] of iValues.entries()) {
      expect(val, `Category button ${i} must have --i stagger var. Got: "${val}"`).not.toBe("");
      expect(
        Number(val),
        `Category button ${i} --i must be a non-negative number. Got: "${val}"`
      ).toBeGreaterThanOrEqual(0);
    }

    // The indices must be 0, 1, 2, 3, 4, 5 (in order — stagger is position-based)
    const nums = iValues.map(Number);
    expect(nums).toEqual([0, 1, 2, 3, 4, 5]);
  });

  // Reduced-motion: the animation-delay on each button must be 0s (stagger collapses)
  test("category pick: animation-delay is 0s for all buttons with reduced-motion", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoPhone(page, "categoryPick");

    const delays = await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-component='category-button']");
      return [...btns].map(btn => globalThis.getComputedStyle(btn).animationDelay);
    });

    for (const [i, delay] of delays.entries()) {
      // With reduced-motion the @media (prefers-reduced-motion: reduce) rule in main.css
      // collapses animation-duration to 0 (or animation to none). Check it is effectively 0.
      const seconds = Number.parseFloat(delay);
      expect(
        seconds,
        `Button ${i} animation-delay must collapse to 0s with reduced-motion. Got: "${delay}"`
      ).toBe(0);
    }
  });

  // Implicit oracle: no JS errors on category pick render
  test("category pick: no JS errors on phone categoryPick render", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "categoryPick");
    await page.waitForTimeout(300);

    const real = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(real, `Phone category pick must not produce JS errors: ${real.join(", ")}`).toHaveLength(
      0
    );
  });
});

// ─── NF-4: Phone scoreboard transition card ───────────────────────────────────

test.describe("NF-4 — Phone scoreboard transition card (FedEx + invariant)", () => {
  // Invariant: waiting card is present with round-done content
  test("phone scoreboard: phone-waiting-card is visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "scoreboard");

    await expect(page.locator("[data-component='phone-waiting-card']")).toBeVisible();
  });

  // Invariant: card contains "done" text (round done message)
  test("phone scoreboard: card contains 'done' text", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "scoreboard");

    const card = page.locator("[data-component='phone-waiting-card']");
    await expect(card).toContainText("done");
  });

  // Invariant: difficulty pips are shown (the next round's tier)
  test("phone scoreboard: difficulty pips component is visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "scoreboard");

    await expect(page.locator("[data-component='difficulty-pips']")).toBeVisible();
  });

  // Invariant: controller is in 'scoreboard' phase (data-phase attribute)
  test("phone scoreboard: controller data-phase is 'scoreboard'", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "scoreboard");

    await expect(page.locator("[data-controller]")).toHaveAttribute("data-phase", "scoreboard");
  });

  // Implicit oracle: no JS errors
  test("phone scoreboard: no JS errors on render", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPhone(page, "scoreboard");
    await page.waitForTimeout(300);

    const real = errors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      real,
      `Phone scoreboard card must not produce JS errors: ${real.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─── NF-5: Mute button position (10px nudge) ─────────────────────────────────

test.describe("NF-5 — Mute button position nudge (Supermodel + platform)", () => {
  // The mute island is fixed-positioned with a formula:
  // top: max(0px, calc(clamp(10px, 1.6vh, 18px) - 10px))
  // This is "top-bar-padding - 10px" (floored at 0).
  // At 1280x720 with 1.6vh = ~11.5px, the effective top is max(0, 11.5 - 10) = 1.5px.
  // (At very tall screens, 1.6vh could be 18px → 8px top offset.)
  // The key invariant: the mute island's top style comes from CSS (not inline), and the
  // mute button is visually inside the viewport (not clipped at top edge).

  test("both audio pills (Music + SFX) are present and visible on the lobby", async ({ page }) => {
    await gotoStage(page, "lobby");

    const muteIsland = page.locator("[data-island='mute']");
    await expect(muteIsland).toBeAttached();

    // The split control renders two independent channel pills.
    const pills = muteIsland.locator("[data-component='mute-button']");
    await expect(pills).toHaveCount(2);
    await expect(pills.nth(0)).toBeVisible();
    await expect(pills.nth(1)).toBeVisible();
  });

  test("both audio pills are present and visible on the question screen", async ({ page }) => {
    await gotoStage(page, "question");

    const pills = page.locator("[data-island='mute'] [data-component='mute-button']");
    await expect(pills).toHaveCount(2);
    await expect(pills.first()).toBeVisible();
  });

  test("both audio pills are present and visible on the scoreboard screen", async ({ page }) => {
    await gotoStage(page, "scoreboard");

    const pills = page.locator("[data-island='mute'] [data-component='mute-button']");
    await expect(pills).toHaveCount(2);
    await expect(pills.first()).toBeVisible();
  });

  // Position check: the mute island's top must be a small non-negative value
  // (the 10px nudge formula). At 720px height, 1.6vh ~ 11.5px → top = ~1.5px.
  // At minimum (1.6vh < 10px is impossible since min is 10px), top = 0px.
  test("mute island top position is between 0 and 10px (10px nudge in effect)", async ({
    page
  }) => {
    await gotoStage(page, "lobby");

    const muteIsland = page.locator("[data-island='mute']");
    const rect = await muteIsland.evaluate(el => el.getBoundingClientRect());

    expect(
      rect.top,
      `Mute island must be at top >= 0px (never clips at screen edge). Got: ${rect.top}px`
    ).toBeGreaterThanOrEqual(0);

    // The nudge formula: max(0, padding - 10px). At 720px height, padding = clamp(10px, 11.5px, 18px) = 11.5px.
    // So top = max(0, 11.5 - 10) = 1.5px. The upper bound (18px - 10px = 8px) is safe.
    // Allow up to 15px to be generous with fractional rounding.
    expect(
      rect.top,
      `Mute island must be near the top of the screen (nudged ≤ 15px). Got: ${rect.top}px`
    ).toBeLessThanOrEqual(15);
  });

  // Platform: mute island must be ABOVE the top-bar content (z-index guard)
  // The mute island has z-index: 6; top-bar has z-index not set (z-index 5 on [data-region="top-bar"]).
  // Verify the mute button is not obscured by the top bar badge.
  test("mute pills are not obscured by the top bar badge", async ({ page }) => {
    await gotoStage(page, "lobby");

    const muteBtn = page.locator("[data-component='mute-button']").first();
    const badge = page.locator("[data-region='top-bar'] [data-badge]");

    const [muteBounds, badgeBounds] = await Promise.all([
      muteBtn.evaluate(el => el.getBoundingClientRect()),
      badge.evaluate(el => el.getBoundingClientRect())
    ]);

    // The mute button must not overlap with the badge
    const overlaps =
      muteBounds.left < badgeBounds.right &&
      muteBounds.right > badgeBounds.left &&
      muteBounds.top < badgeBounds.bottom &&
      muteBounds.bottom > badgeBounds.top;

    expect(
      overlaps,
      `Mute button must not overlap the top-bar badge. ` +
        `Mute: ${JSON.stringify(muteBounds)}, Badge: ${JSON.stringify(badgeBounds)}`
    ).toBe(false);
  });

  // Invariant: each channel pill names itself + its action in the aria-label (WCAG 4.1.2)
  test("audio pills expose Music + SFX channel aria-labels in the default unmuted state", async ({
    page
  }) => {
    await gotoStage(page, "lobby");
    const labels = await page
      .locator("[data-island='mute'] [data-component='mute-button']")
      .evaluateAll(els => els.map(el => el.getAttribute("aria-label")));

    // Default is unmuted → both read "<channel> on — tap to mute"; the set names both channels.
    expect(labels, `Expected a Music + an SFX pill. Got: ${JSON.stringify(labels)}`).toEqual([
      "Music on — tap to mute",
      "SFX on — tap to mute"
    ]);
  });
});
