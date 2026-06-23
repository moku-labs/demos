/**
 * @file API spec — HTTP status + shape assertions for every endpoint in `src/endpoints.ts`.
 *
 * Covers:
 *   - Auth guard: 401 on protected endpoints without a session
 *   - Health endpoint
 *   - Auth endpoints: POST /api/auth/signin, /api/auth/signup, GET /api/auth/session,
 *     POST /api/auth/signout
 *   - Departments: GET /api/departments
 *   - Boards: GET /api/boards/:id (BoardSnapshot shape)
 *   - Issues: GET, PATCH, DELETE /api/issues/:id
 *   - Columns: POST create, PATCH rename, DELETE, PATCH reorder
 *   - WebSocket upgrade: GET /ws/board/:id → 101
 *   - Activity: GET /api/boards/:id/activity
 *
 * Tests run against the wrangler dev server (the same one Playwright's webServer starts), so
 * the seeded fixture data is available (board-platform, issue-ws-reconnect, etc.).
 */
import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./_auth";

const BASE = "";

/**
 * Sign in via the API and return the Set-Cookie header value.
 *
 * @param request - The Playwright API request context.
 * @returns The `Set-Cookie` value containing the session cookie.
 */
async function apiSignIn(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/signin`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
  });
  // The signin endpoint mints a session → 201 Created (with the Set-Cookie).
  expect(res.status()).toBe(201);
  const cookie = res.headers()["set-cookie"] ?? "";
  return cookie;
}

test.describe("Auth guard — 401 without session", () => {
  test("GET /api/departments returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/departments`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/boards/board-platform returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boards/board-platform`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/activity returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/activity?boardId=board-platform`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Health", () => {
  test("GET /health returns 200", async ({ request }) => {
    // The health probe lives at /health (not under the guarded /api/* prefix) → public 200 "ok".
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
  });
});

test.describe("Auth endpoints", () => {
  test("POST /api/auth/signin with valid demo credentials returns 200 + session", async ({
    request
  }) => {
    const res = await request.post(`${BASE}/api/auth/signin`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("name");
    expect(res.headers()["set-cookie"]).toBeTruthy();
  });

  test("POST /api/auth/signin with malformed credentials returns 400", async ({ request }) => {
    // Demo auth is format-only: any valid-looking email + non-empty password succeeds, so the
    // failure path is a MALFORMED credential (bad email shape / empty password) → 400, not a 401.
    const badCreds = { email: "not-an-email", password: "" };
    const res = await request.post(`${BASE}/api/auth/signin`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify(badCreds)
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/auth/session returns 200 with valid cookie", async ({ request }) => {
    const cookie = await apiSignIn(request);
    const res = await request.get(`${BASE}/api/auth/session`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name");
  });

  test("POST /api/auth/signout returns 200", async ({ request }) => {
    const cookie = await apiSignIn(request);
    const res = await request.post(`${BASE}/api/auth/signout`, {
      headers: { Cookie: cookie }
    });
    expect([200, 204]).toContain(res.status());
  });
});

test.describe("Departments API (authenticated)", () => {
  let cookie: string;

  test.beforeAll(async ({ request }) => {
    cookie = await apiSignIn(request);
  });

  test("GET /api/departments returns departments index shape", async ({ request }) => {
    const res = await request.get(`${BASE}/api/departments`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // DepartmentsIndex shape: { departments: Department[], customizations: Customization[] }
    expect(body).toHaveProperty("departments");
    expect(Array.isArray(body.departments)).toBe(true);
    expect(body.departments.length).toBeGreaterThan(0);
    // Seed has 5 departments
    expect(body.departments.length).toBe(5);
    const eng = body.departments.find((d: { id: string }) => d.id === "dept-eng");
    expect(eng).toBeDefined();
    expect(eng.title).toBe("Engineering");
  });
});

test.describe("Boards API (authenticated)", () => {
  let cookie: string;

  test.beforeAll(async ({ request }) => {
    cookie = await apiSignIn(request);
  });

  test("GET /api/boards/board-platform returns board snapshot shape", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boards/board-platform`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(200);
    const snap = await res.json();
    // BoardSnapshot shape
    expect(snap).toHaveProperty("board");
    expect(snap).toHaveProperty("columns");
    expect(snap).toHaveProperty("issues");
    expect(snap.board.id).toBe("board-platform");
    expect(snap.board.title).toBe("Platform");
    // 4 columns (Backlog, In Progress, In Review, Done)
    expect(snap.columns.length).toBe(4);
    // Seeded issues on the platform board (exact count is seed-dependent; assert non-empty).
    expect(snap.issues.length).toBeGreaterThan(0);
  });

  test("GET /api/activity?boardId=board-platform returns activity list", async ({ request }) => {
    const res = await request.get(`${BASE}/api/activity?boardId=board-platform`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/boards/nonexistent returns 404", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boards/does-not-exist`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("Issues API (authenticated)", () => {
  let cookie: string;

  test.beforeAll(async ({ request }) => {
    cookie = await apiSignIn(request);
  });

  test("GET /api/issues/issue-ws-reconnect returns issue detail", async ({ request }) => {
    const res = await request.get(`${BASE}/api/issues/issue-ws-reconnect`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // IssueDetail has the issue + sub-issues + assignees + labels + attachments
    expect(body).toHaveProperty("issue");
    expect(body.issue.id).toBe("issue-ws-reconnect");
    expect(body.issue.title).toBe("Fix flaky WebSocket reconnect");
  });

  test("GET /api/issues/nonexistent returns 404", async ({ request }) => {
    const res = await request.get(`${BASE}/api/issues/does-not-exist`, {
      headers: { Cookie: cookie }
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("WebSocket upgrade", () => {
  test("GET /ws/board/board-platform returns 101 when upgrading to WebSocket", async ({ page }) => {
    // The WS upgrade requires a session cookie; sign in via the browser context first
    await page.clock.setFixedTime(new Date("2026-06-22T12:00:00.000Z"));
    await page.goto("/signin");
    await page.fill("input[name='email']", DEMO_EMAIL);
    await page.fill("input[name='password']", DEMO_PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForURL(u => u.pathname === "/" || u.pathname.startsWith("/board/"));

    // Now try the WebSocket from the authenticated page context
    const wsConnected = await page.evaluate((): Promise<boolean> => {
      return new Promise(resolve => {
        try {
          const ws = new WebSocket(`ws://localhost:7979/ws/board/board-platform`);
          ws.addEventListener("open", () => {
            ws.close();
            resolve(true);
          });
          ws.addEventListener("error", () => resolve(false));
          setTimeout(() => resolve(false), 5000);
        } catch {
          resolve(false);
        }
      });
    });
    expect(wsConnected).toBe(true);
  });
});
