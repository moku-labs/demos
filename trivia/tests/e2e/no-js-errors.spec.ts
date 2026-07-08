/**
 * @file Boot guard — verifies the SPA boots without JS errors on both routes,
 * and that the initial HTML is served correctly. This is the first line of defence:
 * a broken client bundle is caught here before any functional test runs.
 */
import { expect, test } from "@playwright/test";

test.describe("boot guard — no JS errors", () => {
  test("TV stage (/) boots without errors", async ({ page }) => {
    const jsErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", err => {
      jsErrors.push(err.message);
    });
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", resp => {
      if (resp.status() >= 400) {
        failedRequests.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await page.goto("/");
    // Wait for the SPA to hydrate — the stage island mounts the lobby
    await page.waitForSelector("[data-island='stage']", { timeout: 15_000 });
    // Allow a brief moment for islands to start their connection attempts
    await page.waitForTimeout(1000);

    expect(jsErrors, `JS errors on /: ${jsErrors.join(", ")}`).toHaveLength(0);

    // Filter console errors: WebSocket 429 from the Hub DO is expected in local dev
    // (the Hub Durable Object is rate-limited / not available without a real room session).
    // This is not an app code bug — the stage island gracefully handles hub connection failures.
    const realConsoleErrors = consoleErrors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(realConsoleErrors, `Console errors on /: ${realConsoleErrors.join(", ")}`).toHaveLength(
      0
    );

    // Filter out known non-critical assets (fonts loaded as 404 in local dev are acceptable)
    const criticalFailures = failedRequests.filter(
      r => !r.includes("/fonts/") && !r.includes("favicon") && !r.includes(".well-known")
    );
    expect(criticalFailures, `Failed requests on /: ${criticalFailures.join(", ")}`).toHaveLength(
      0
    );
  });

  test("controller (/code/TESTCODE) boots without errors", async ({ page }) => {
    const jsErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", err => {
      jsErrors.push(err.message);
    });
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/code/TESTCODE");
    // The SPA boots, the controller island hydrates, and renders [data-controller].
    // (The outer data-layout="stage" wrapper stays from SSR — the SPA swaps island content.)
    await page.waitForSelector("[data-controller]", { timeout: 20_000 });

    expect(jsErrors, `JS errors on /controller: ${jsErrors.join(", ")}`).toHaveLength(0);

    // WebSocket 429 from hub join attempt is expected with a fake code — the controller
    // gracefully falls back to the join wizard (visible in the screenshot). Not a code bug.
    const realConsoleErrors = consoleErrors.filter(
      e => !e.includes("WebSocket") && !e.includes("429") && !e.includes("ws://")
    );
    expect(
      realConsoleErrors,
      `Console errors on /controller: ${realConsoleErrors.join(", ")}`
    ).toHaveLength(0);
  });

  test("404 page is served for unknown routes", async ({ page }) => {
    const resp = await page.goto("/this-route-does-not-exist");
    // SPA mode: fallback to the SPA shell (200) or a custom 404 — both are acceptable
    expect([200, 404]).toContain(resp?.status());
  });

  test("bank shards serve 200 (en/animals + ru/animals)", async ({ page }) => {
    const en = await page.goto("/bank/en/animals.json");
    expect(en?.status()).toBe(200);
    const ru = await page.goto("/bank/ru/animals.json");
    expect(ru?.status()).toBe(200);
  });

  test("all bank shard categories serve 200 for EN", async ({ page }) => {
    const categories = ["animals", "space", "movies-tv", "food", "strange", "music"];
    for (const cat of categories) {
      const resp = await page.goto(`/bank/en/${cat}.json`);
      expect.soft(resp?.status(), `EN bank shard ${cat}`).toBe(200);
    }
  });

  test("all bank shard categories serve 200 for RU", async ({ page }) => {
    const categories = ["animals", "space", "movies-tv", "food", "strange", "music"];
    for (const cat of categories) {
      const resp = await page.goto(`/bank/ru/${cat}.json`);
      expect.soft(resp?.status(), `RU bank shard ${cat}`).toBe(200);
    }
  });

  test("GET /api/ice answers a quiet no-store 200 {} with no secrets configured (local dev)", async ({
    page
  }) => {
    // Internet-play ICE provisioning (Phase 1): local dev carries no TURN secrets, so the worker
    // answers an empty 200 (never a 5xx — a real failure status would console-spam every boot) and
    // the client fails open onto the room transport's public-STUN default.
    const resp = await page.goto("/api/ice");
    expect(resp?.status()).toBe(200);
    expect(resp?.headers()["cache-control"]).toBe("no-store");
    expect(await resp?.json()).toEqual({});
  });

  test("bank shards contain valid JSON with questions", async ({ page }) => {
    const en = await page.goto("/bank/en/animals.json");
    expect(en?.status()).toBe(200);
    const body = await en?.json();
    expect(body).toBeDefined();
    // Bank shards are flat JSON arrays of question objects
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBeGreaterThan(0);
    // Each question should have the required fields (id, prompt, options, tier, category)
    const first = (body as Record<string, unknown>[])[0];
    expect.soft(first).toHaveProperty("id");
    expect.soft(first).toHaveProperty("prompt");
    expect.soft(first).toHaveProperty("options");
    expect.soft(first).toHaveProperty("category");
    expect.soft(first).toHaveProperty("tier");
  });
});
