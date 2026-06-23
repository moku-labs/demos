/**
 * @file Board-create slug guard (#slug): a new board's id is a SHORT, always-English `{n}-{slug}` derived
 * from its title. Non-Latin titles (Cyrillic, Greek) are transliterated to ASCII so the URL is always
 * readable English, and the slug is clamped short on a whole-word boundary. Boards are created in the
 * off-screen `dept-eng` so they never disturb the visual baselines.
 */
import { expect, type Page, test } from "@playwright/test";
import { FIXED_TIME, signIn } from "./_auth";

/**
 * Create a board via the API and return its generated id.
 *
 * @param page - The Playwright page (its request context carries the auth cookie).
 * @param title - The board title to derive the id from.
 * @returns The created board's id.
 */
async function createBoardId(page: Page, title: string): Promise<string> {
  const res = await page.request.post("/api/boards", {
    data: { departmentId: "dept-eng", title }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

test.describe("Board create — short, always-English {n}-slug id from the title", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await signIn(page);
  });

  test("a Latin title becomes a numbered {n}-slug", async ({ page }) => {
    expect(await createBoardId(page, "Mobile App")).toMatch(/^\d+-mobile-app$/);
  });

  test("a Cyrillic title is transliterated to English ASCII", async ({ page }) => {
    const id = await createBoardId(page, "Платформа");
    expect(id).toMatch(/^\d+-platforma$/);
    expect(id).toMatch(/^[a-z0-9-]+$/); // URL-safe ASCII only — no Cyrillic survives
  });

  test("the slug is kept short, clamped on a whole-word boundary", async ({ page }) => {
    const id = await createBoardId(
      page,
      "Platform infrastructure observability redesign initiative"
    );
    const slug = id.replace(/^\d+-/, "");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug).toBe("platform-infrastructure");
  });

  test("the board is reachable at its generated id URL (hard load resolves it)", async ({
    page
  }) => {
    const id = await createBoardId(page, "Слаг Тест Дошка"); // Cyrillic → transliterated
    await page.goto(`/board/${id}`);
    await page.waitForLoadState("load");
    await expect(page.locator("[data-board] [data-column]").first()).toBeVisible();
  });
});
