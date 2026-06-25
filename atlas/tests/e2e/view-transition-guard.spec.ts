/**
 * @file Regression — the View Transitions crossfade must never leak an "Uncaught (in promise)
 * AbortError: Transition was skipped" when one navigation supersedes another mid-crossfade.
 *
 * Root cause (framework, moku-web `runSwap`): the swap observes only `transition.finished` (which
 * RESOLVES on a skip) and never `transition.ready` (which REJECTS with AbortError when a second
 * transition preempts the first before it paints). The app installs `installViewTransitionGuard`
 * (src/lib/view-transitions.ts) to swallow that one benign rejection.
 *
 * This spec runs with motion ENABLED — the rest of the suite forces `reducedMotion: "reduce"`, which
 * disables `startViewTransition` entirely, so the bug is structurally invisible to every other spec
 * (which is exactly why it shipped). The first test deterministically reproduces the framework's leak;
 * the second mashes real overlapping navigations.
 */
import { expect, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

test.describe("View transitions — no uncaught AbortError on interrupted nav", () => {
  // Re-enable motion for this spec only (overrides the project-level reducedMotion: "reduce").
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("a superseded crossfade never leaks 'Transition was skipped'", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", err => consoleErrors.push(err.message));

    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");

    // Preconditions — if either fails, the framework would skip startViewTransition and the bug could
    // not occur, making a "pass" meaningless. Assert them so the test can never be a false green.
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      false
    );
    expect(await page.evaluate(() => typeof document.startViewTransition === "function")).toBe(
      true
    );

    // Reproduce the framework's `runSwap` leak byte-for-byte: two transitions in the SAME task, each
    // observing only `.finished`. The first is skipped before `ready`, so its `ready` rejects with
    // AbortError. The app's guard must mark that rejection handled (defaultPrevented).
    const rejections = await page.evaluate(async () => {
      const seen: { message: string; defaultPrevented: boolean }[] = [];
      const onRejection = (event: PromiseRejectionEvent) =>
        seen.push({
          message: String(event.reason?.message ?? event.reason),
          defaultPrevented: event.defaultPrevented
        });
      globalThis.addEventListener("unhandledrejection", onRejection);
      const runSwapLikeFramework = () => {
        const transition = document.startViewTransition(() => {});
        Promise.resolve(transition?.finished)
          .then(() => {})
          .catch(() => {});
      };
      runSwapLikeFramework();
      runSwapLikeFramework();
      await new Promise(resolve => setTimeout(resolve, 400));
      globalThis.removeEventListener("unhandledrejection", onRejection);
      return seen;
    });

    const skips = rejections.filter(r => /transition/i.test(r.message));
    expect(skips.length).toBeGreaterThan(0); // the skip DID happen (bug is live without the guard)
    expect(skips.every(r => r.defaultPrevented)).toBe(true); // and the guard swallowed every one
    expect(consoleErrors.filter(t => /transition was skipped/i.test(t))).toHaveLength(0);
  });

  test("rapid overlapping board/list/activity navigation stays clean", async ({ page }) => {
    const skipErrors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error" && /transition/i.test(msg.text())) skipErrors.push(msg.text());
    });
    page.on("pageerror", err => {
      if (/transition/i.test(err.message)) skipErrors.push(err.message);
    });

    await page.goto("/board/board-platform");
    await page.waitForLoadState("load");

    // Mash navigations faster than the ~260ms crossfade so transitions overlap, as a fast human would.
    // Driven from the test side (single-purpose evaluate per hop) so the in-page code stays trivial.
    const routes = [
      "/board/board-platform/list",
      "/board/board-platform",
      "/board/board-platform/activity",
      "/board/board-platform"
    ];
    for (let round = 0; round < 3; round++) {
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
        await page.waitForTimeout(30);
      }
    }
    await page.waitForTimeout(700);

    expect(skipErrors).toHaveLength(0);
  });
});
