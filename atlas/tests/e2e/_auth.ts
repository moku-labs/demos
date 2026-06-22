/**
 * @file Shared auth helpers for Atlas E2E tests.
 *
 * The app uses a demo auth stub: any `local@domain.tld` email + non-empty password works.
 * The worker guard returns 401 on all `/api/*` and `/ws/*` routes (except `/api/auth/*`)
 * unless the `atlas_session` HttpOnly cookie is set, so every board/issue/activity test
 * must sign in first.
 *
 * `signIn(page)` navigates to `/signin`, fills the form, submits, and waits for the
 * redirect back to `/` (the home board). The cookie is stored in the browser context and
 * automatically sent on subsequent requests in the same test.
 *
 * `FIXED_TIME` is the frozen clock value used in all specs — matches the current date so
 * relative times in the UI (activity "X ago", due chips "overdue") are deterministic.
 */
import type { Page } from "@playwright/test";

/** Fixed clock value (2026-06-22T12:00:00Z) — freeze with `page.clock.setFixedTime`. */
export const FIXED_TIME = new Date("2026-06-22T12:00:00.000Z");

/** Demo credentials — format-only auth accepts any valid-looking email + non-empty password. */
export const DEMO_EMAIL = "demo@atlas.dev";
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- intentionally literal demo credential for the stub auth, not a real secret
export const DEMO_PASSWORD = "demo-1234";

/**
 * Sign in via the `/signin` page and wait for the redirect to the home board.
 *
 * @param page - The Playwright page.
 * @returns Resolves once the session cookie is set and the home board is loaded.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/signin");
  await page.waitForURL(/signin\/?$/);

  await page.fill(
    "[data-field='email'] input, input[type='email'], input[name='email']",
    DEMO_EMAIL
  );
  await page.fill(
    "[data-field='password'] input, input[type='password'], input[name='password']",
    DEMO_PASSWORD
  );
  await page.click("[data-action='signin'], button[type='submit']");
  /* Wait for the home board to load (the worker validates the session and serves board data) */
  await page.waitForURL(u => u.pathname === "/" || u.pathname.startsWith("/board/"));
}

/**
 * Freeze the page clock and wait for fonts to load before taking a screenshot.
 *
 * @param page - The Playwright page.
 * @returns Resolves when both the clock is frozen and fonts are ready.
 */
export async function prepareScreenshot(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.evaluate(() => document.fonts.ready);
}
