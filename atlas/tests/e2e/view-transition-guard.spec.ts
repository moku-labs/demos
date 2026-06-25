/**
 * @file Regression (integration) — interrupted View Transitions must never leak an "Uncaught (in
 * promise) AbortError: Transition was skipped" during rapid / overlapping navigation.
 *
 * The fix lives in the FRAMEWORK: `@moku-labs/web`'s `runSwap` attaches a `.catch` to the transition's
 * `ready` promise — which rejects when a crossfade is superseded before it paints, while `finished`
 * still resolves and the swap still applies. The deterministic unit regression lives in moku-web
 * (`src/plugins/spa/__tests__/unit/router.test.ts`); THIS spec verifies the integration end-to-end in
 * a real browser with motion ENABLED. The rest of the suite forces `reducedMotion: "reduce"`, which
 * disables `startViewTransition` entirely — so this whole class of bug is invisible to every other spec
 * (which is why it shipped originally). The app holds NO view-transition workaround of its own.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

test.describe("View transitions — interrupted navigation never leaks an AbortError", () => {
  // Re-enable motion for this spec only (overrides the project-level reducedMotion: "reduce").
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("rapid overlapping navigation produces no uncaught 'Transition was skipped'", async ({
    page
  }) => {
    const leaks: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error" && /transition/i.test(msg.text())) leaks.push(msg.text());
    });
    page.on("pageerror", err => {
      if (/transition/i.test(err.message)) leaks.push(err.message);
    });

    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");

    // Preconditions — without these the framework skips startViewTransition and the bug cannot occur,
    // making a "pass" meaningless. Assert them so the test can never be a false green.
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      false
    );
    expect(await page.evaluate(() => typeof document.startViewTransition === "function")).toBe(
      true
    );

    // Record any in-page unhandled rejection that mentions a transition (the exact symptom guarded).
    await page.evaluate(() => {
      const w = globalThis as unknown as { __vtLeaks: string[] };
      w.__vtLeaks = [];
      globalThis.addEventListener("unhandledrejection", event => {
        const reason = (event as PromiseRejectionEvent).reason;
        const message = String(reason?.message ?? reason);
        if (/transition/i.test(message)) w.__vtLeaks.push(message);
      });
    });

    // Mash navigations far faster than the ~260ms crossfade so transitions overlap and some are
    // superseded before they paint — the path that rejects `ready`.
    const routes = [
      "/board/board-platform/list",
      "/board/board-platform",
      "/board/board-platform/activity",
      "/board/board-platform"
    ];
    for (let round = 0; round < 4; round++) {
      for (const route of routes) {
        await page.evaluate(href => {
          const anchor = document.createElement("a");
          anchor.href = href;
          // appendChild (not append): @cloudflare/workers-types merges a conflicting append overload;
          // the anchor must be in the DOM so the SPA's document-level click interceptor sees the nav.
          // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }, route);
        await page.waitForTimeout(15);
      }
    }
    await page.waitForTimeout(700);

    const pageLeaks = await page.evaluate(
      () => (globalThis as unknown as { __vtLeaks: string[] }).__vtLeaks
    );
    expect(leaks).toHaveLength(0);
    expect(pageLeaks).toHaveLength(0);
  });
});
