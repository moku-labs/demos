/**
 * @file Scoreboard-animation case matrix (spec/scoreboard-animation.md §4) — e2e coverage of the
 * whole schema: the derivation model (§1), the choreography (§2), and every invariant (§3) as they
 * play out in the REAL DOM. Each `S#` case here maps 1:1 to the spec table and, where it applies, the
 * unit test of the same name in `tests/unit/leaderboard.test.ts`.
 *
 * S1 (single overtake) and S3 (gain, no motion) are covered directly by the base "scoreboard" fixture
 * (Pixel overtakes Tofu +400; Mochi gains +200 without moving) — the same fixture the rest of the
 * suite uses, so this file exercises them alongside S2/S4/S5/S6/S7/S9/S11 rather than duplicating a
 * dedicated fixture. S8/S10/S14 are pure-derivation cases already pinned by the unit suite with no DOM
 * behaviour beyond what S4/S3/S1's DOM assertions already cover — see the "unit-only" note below.
 *
 * Every case asserts, at BOTH the `delta` hold and after `settled` (per spec §4's closing paragraph):
 * tile count, DOM order, per-tile `data-position`/`data-prev-position`, pairwise-disjoint bounding
 * boxes (§I1 — the reported overlap bug), rank labels (§I4), and badge visibility (§2).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { StagePhaseKey } from "./harness/fixtures";
import { SCOREBOARD_MATRIX } from "./harness/scoreboard-matrix";

/** Navigate to a fixture phase screen and wait for the stage to render it (mirrors stage-screens.spec.ts). */
async function gotoStage(page: Page, phase: StagePhaseKey): Promise<void> {
  await page.goto(`/?e2ephase=${phase}`);
  await page.waitForSelector("[data-stage][data-phase='scoreboard']", { timeout: 20_000 });
  await expect(
    page.locator("html"),
    "E2E harness not active — start the dev server with TRIVIA_E2E=1 (the Playwright webServer sets it)"
  ).toHaveAttribute("data-e2e-harness", "fixtures");
  await page.evaluate(() => document.fonts.ready);
}

/** One tile's read-out: its position/prevPosition, rank label text, moved-up state, and bounding box. */
type TileSnapshot = {
  peerName: string;
  position: number;
  prevPosition: number;
  rankLabel: string;
  movedUp: boolean;
  box: { x: number; y: number; width: number; height: number };
};

/**
 * Read a data attribute off a Playwright `Locator`.
 *
 * @param locator - The element locator.
 * @param name - The attribute name (e.g. `"data-position"`).
 * @returns The attribute's string value, or `null` when absent.
 */
async function attr(locator: Locator, name: string): Promise<string | null> {
  return locator.getAttribute(name);
}

/** Read every rendered tile's geometry + attributes, in DOM order. */
async function readTiles(page: Page): Promise<TileSnapshot[]> {
  const tiles = page.locator("[data-component='scoreboard-tile']");
  const count = await tiles.count();
  const out: TileSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const tile = tiles.nth(i);
    const box = await tile.boundingBox();
    expect(box, `tile ${i} must have a bounding box`).not.toBeNull();
    const [position, prevPosition, rankLabel, movedUp, peerName] = await Promise.all([
      attr(tile, "data-position"),
      attr(tile, "data-prev-position"),
      tile.locator("[data-rank]").textContent(),
      attr(tile, "data-moved-up"),
      tile.locator("[data-name]").textContent()
    ]);
    out.push({
      peerName: (peerName ?? "").trim(),
      position: Number(position),
      prevPosition: Number(prevPosition),
      rankLabel: (rankLabel ?? "").trim(),
      movedUp: movedUp === "true",
      box: box as { x: number; y: number; width: number; height: number }
    });
  }
  return out;
}

/** §I1 — no two tiles may occupy overlapping vertical space at any instant of any phase. */
function assertPairwiseDisjoint(tiles: readonly TileSnapshot[]): void {
  const byTop = tiles.toSorted((a, b) => a.box.y - b.box.y);
  for (let i = 1; i < byTop.length; i++) {
    const prev = byTop[i - 1];
    const curr = byTop[i];
    if (!prev || !curr) continue;
    expect(
      curr.box.y,
      `tiles must not overlap vertically — "${prev.peerName}" (bottom ${prev.box.y + prev.box.height}) vs "${curr.peerName}" (top ${curr.box.y})`
    ).toBeGreaterThanOrEqual(prev.box.y + prev.box.height - 1);
  }
}

/** The visual (y-coordinate) order of tiles, top to bottom, as peer names. */
function visualOrder(tiles: readonly TileSnapshot[]): string[] {
  return tiles.toSorted((a, b) => a.box.y - b.box.y).map(t => t.peerName);
}

/** The DOM order of tiles, as peer names (rendering order — always `position` order by construction). */
function domOrder(tiles: readonly TileSnapshot[]): string[] {
  return tiles.map(t => t.peerName);
}

/** Read the scoreboard root's current `data-choreography` phase. */
async function choreography(page: Page): Promise<string | null> {
  return attr(page.locator("[data-component='stage-scoreboard']"), "data-choreography");
}

// ─── S1–S9, S11: motion ON — proves the FULL choreography (delta hold → settled) ─────

test.describe("Scoreboard animation — case matrix, motion ON (spec §4)", () => {
  for (const c of SCOREBOARD_MATRIX) {
    test(`${c.id}: delta hold shows PRE order, settled shows POST order, no overlap either phase`, async ({
      page
    }) => {
      await gotoStage(page, c.phase);

      // ── "delta" hold: rows sit at their PRE-round slots (the count-up beat) ──
      expect(await choreography(page)).toBe("delta");
      const deltaTiles = await readTiles(page);
      expect(deltaTiles).toHaveLength(c.preOrder.length);
      assertPairwiseDisjoint(deltaTiles); // §I1 — the reported overlap bug, at the FIRST instant
      expect(
        visualOrder(deltaTiles),
        "visual (y-order) must equal the PRE-round order during the delta hold"
      ).toEqual(c.preOrder);
      // Every tile's data-prev-position matches its rendered (pre-round) slot index.
      const byPrevPosition = deltaTiles.toSorted((a, b) => a.prevPosition - b.prevPosition);
      expect(byPrevPosition.map(t => t.peerName)).toEqual(c.preOrder);
      // Rank labels show the PRE-round label during the delta hold (§I4/§2).
      for (const tile of deltaTiles) expect(tile.rankLabel.length).toBeGreaterThan(0);
      // No overtake badge yet — the badge only pops from "reorder" on (§2).
      await expect(page.locator("[data-component='scoreboard-tile'] [data-badge]")).toHaveCount(0);

      // ── "settled": rows sit at their POST-round slots, badges visible on movers ──
      await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
        "data-choreography",
        "settled",
        { timeout: 4000 }
      );
      const settledTiles = await readTiles(page);
      assertPairwiseDisjoint(settledTiles); // §I1 — still true once everything has moved
      expect(
        visualOrder(settledTiles),
        "visual (y-order) must equal the POST-round order once settled"
      ).toEqual(c.postOrder);
      expect(
        domOrder(settledTiles),
        "DOM order always equals position order (rows[i].position === i, spec §1)"
      ).toEqual(c.postOrder);
      // Every tile transform is at rest (translateY(0)) — no stuck seeded transform (§I5).
      const transforms = await page
        .locator("[data-component='scoreboard-tile']")
        .evaluateAll(els => els.map(el => (el as HTMLElement).style.transform));
      for (const t of transforms) expect(t).toBe("translateY(0px)");

      const moversByName = new Map(settledTiles.map(t => [t.peerName, t]));
      for (const moverName of c.movers) {
        const mover = moversByName.get(moverName);
        expect(mover, `expected mover "${moverName}" to be a rendered tile`).toBeDefined();
        expect(mover?.movedUp, `${moverName} must carry [data-moved-up]`).toBe(true);
      }
      // Non-movers never carry the attribute.
      for (const tile of settledTiles) {
        if (!c.movers.includes(tile.peerName)) {
          expect(tile.movedUp, `${tile.peerName} must NOT carry [data-moved-up]`).toBe(false);
        }
      }
      await expect(page.locator("[data-component='scoreboard-tile'] [data-badge]")).toHaveCount(
        c.movers.length
      );
    });
  }
});

// ─── S12: reduced motion — every case lands DIRECTLY on settled, no staggering ────────

test.describe("Scoreboard animation — reduced motion (S12)", () => {
  for (const c of SCOREBOARD_MATRIX) {
    test(`${c.id}: reduced motion collapses straight to settled (final order, rest transforms)`, async ({
      page
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gotoStage(page, c.phase);

      await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
        "data-choreography",
        "settled"
      );
      const tiles = await readTiles(page);
      assertPairwiseDisjoint(tiles);
      expect(visualOrder(tiles)).toEqual(c.postOrder);
      expect(domOrder(tiles)).toEqual(c.postOrder);

      const transforms = await page
        .locator("[data-component='scoreboard-tile']")
        .evaluateAll(els => els.map(el => (el as HTMLElement).style.transform));
      for (const t of transforms) expect(t).toBe("translateY(0px)");

      await expect(page.locator("[data-component='scoreboard-tile'] [data-badge]")).toHaveCount(
        c.movers.length
      );
    });
  }
});

// ─── S10: nobody scored — a fully static board, zero chips, zero motion ───────────────
// S10 reuses the S4/S6 shape (a static board with no deltas) at the DOM level — the case matrix already
// exercises "zero motion" boards (S4, S6, S11); S10 additionally proves NO gain chip renders anywhere
// when every delta is 0, which the base "scoreboard" fixture cannot show (Mochi/Pixel both score there).
// scoreboardZero already carries this exact shape (all zero deltas, Sprout unscored) — reuse it directly.

test.describe("Scoreboard animation — nobody scored (S10)", () => {
  test("a fully static board: no chips, no motion, settled immediately relative to the hold", async ({
    page
  }) => {
    await gotoStage(page, "scoreboardZero");
    // No player scored this round on this board → zero gain chips anywhere, from the very first paint.
    await expect(page.locator("[data-component='scoreboard-tile'] [data-gain]")).toHaveCount(0);
    await expect(page.locator("[data-component='scoreboard-tile'] [data-badge]")).toHaveCount(0);

    const deltaTiles = await readTiles(page);
    assertPairwiseDisjoint(deltaTiles);
    // Static board: prevPosition === position for every row (no motion planned at all).
    for (const tile of deltaTiles) expect(tile.position).toBe(tile.prevPosition);

    await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
      "data-choreography",
      "settled",
      { timeout: 4000 }
    );
    await expect(page.locator("[data-component='scoreboard-tile'] [data-badge]")).toHaveCount(0);
  });
});

// ─── S13: mid-flight interrupt — reduced-motion flips ON while held at "delta" ────────

test.describe("Scoreboard animation — mid-flight reduced-motion interrupt (S13)", () => {
  test("reduced motion flipping on mid-hold snaps straight to settled; nothing sticks between slots", async ({
    page
  }) => {
    // Motion starts ON (no emulateMedia yet) so the board seeds a real, non-zero FLIP offset.
    await gotoStage(page, "scoreboard");
    expect(await choreography(page)).toBe("delta");

    // Identify the mover by NAME (Pixel, per the base fixture), not by [data-moved-up] — that
    // attribute is deliberately absent during "delta" (the badge/glow only appear from "reorder" on,
    // spec §2), so selecting by it here would match zero tiles and silently read a stale/empty value.
    const mover = page
      .locator("[data-component='scoreboard-tile']")
      .filter({ has: page.locator("[data-name]", { hasText: "Pixel" }) });
    const seededTransform = await mover.evaluate(el => (el as HTMLElement).style.transform);
    expect(
      seededTransform,
      "the mover must be genuinely seeded off-rest before the interrupt (a non-zero translateY)"
    ).toMatch(/translateY\((?!0px\)).+\)/);

    // Interrupt mid-flight (~1600ms into the spec's timeline, still within the 1450ms delta hold's
    // tail or the very start of reorder) — the choreography hook re-checks the media query on change.
    await page.waitForTimeout(400);
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Choreography must jump straight to "settled" — never stall in "reorder".
    await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
      "data-choreography",
      "settled",
      { timeout: 2000 }
    );

    // Every tile transform must be pinned at rest — no seeded offset can survive the interrupt (§I5).
    const tiles = await readTiles(page);
    assertPairwiseDisjoint(tiles);
    expect(visualOrder(tiles)).toEqual(["Mochi", "Pixel", "Tofu", "Biscuit", "Sprout"]);
    const transforms = await page
      .locator("[data-component='scoreboard-tile']")
      .evaluateAll(els => els.map(el => (el as HTMLElement).style.transform));
    for (const t of transforms) {
      expect(t, "no seeded transform may survive a mid-flight reduced-motion interrupt").toBe(
        "translateY(0px)"
      );
    }
  });
});

// ─── S8, S14: unit-only — no DOM behaviour beyond what S4/S1 already assert ───────────
// S8 (climbing INTO a tie group — reaching the group's score joins it below, no motion) is the SAME
// DOM shape as S4 (a challenger reaches but does not exceed → zero motion, shared labels) — the
// rendering path is identical; boardRows()'s derivation is what differs, and that is pinned by
// tests/unit/leaderboard.test.ts's "S8 climbing INTO a tie group" case. S14 (a leaver's row drops) has
// no distinct DOM behaviour either — it renders exactly like any other N-row board once the leaver's
// row is excluded (proven by tests/unit/leaderboard.test.ts's "S14 a leaver's row drops"); this file's
// S2/S7 cases already prove the DOM handles a variable, contiguous row count with no gaps. Adding a
// dedicated fixture for either would duplicate coverage without exercising any new code path.

// ─── Visual baseline: a tie case at settled (S4 — shared rank labels visible) ─────────

test.describe("Scoreboard animation — visual baseline (tie case, settled)", () => {
  test("S4 tie-formed board at settled matches the visual baseline", async ({ page }) => {
    await gotoStage(page, "scoreboardS4");
    await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("tv-scoreboard-s4-tie-settled.png", {
      fullPage: false,
      animations: "disabled"
    });
  });
});

// ─── §I1 spot-check: the historical bug case (equal totals) never overlaps ────────────

test.describe("Scoreboard animation — §I1 regression guard (the reported overlap bug)", () => {
  test("two equal-score tiles never render at the same slot (S4) and the rank label flips with the motion", async ({
    page
  }) => {
    await gotoStage(page, "scoreboardS4");
    expect(await choreography(page)).toBe("delta");
    const tiles = await readTiles(page);
    expect(tiles).toHaveLength(2);
    assertPairwiseDisjoint(tiles);
    // The two positions must be a permutation of 0..1 — never the same slot.
    expect(tiles.map(t => t.position).toSorted()).toEqual([0, 1]);

    // §I4/§2 label choreography, value-asserted: ranks are UNIQUE and resolved (product decision
    // 2026-07-03 — never a shared "1, 1"). During the delta hold the labels are the pre-round ranks
    // (1, 2 — Pixel had not yet tied), and once settled they REMAIN 1, 2: Mochi reached 400 first
    // and defends the rank; Pixel tied it but did not exceed it (§I2).
    expect(tiles.map(t => t.rankLabel)).toEqual(["1", "2"]);
    await expect(page.locator("[data-component='stage-scoreboard']")).toHaveAttribute(
      "data-choreography",
      "settled",
      { timeout: 4000 }
    );
    const settledTiles = await readTiles(page);
    expect(settledTiles.map(t => t.rankLabel)).toEqual(["1", "2"]);
  });
});
