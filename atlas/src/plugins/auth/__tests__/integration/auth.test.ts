/* eslint-disable unicorn/no-null -- mocking Cloudflare binding APIs that return null by contract */
/* eslint-disable sonarjs/no-hardcoded-passwords -- test credentials are intentionally literal demo values, not real secrets */

import type { WorkerEnv } from "@moku-labs/worker";

import { createApp, kvPlugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it } from "vitest";
import { authPlugin } from "../../index";
import type { Api, Session } from "../../types";

// ---------------------------------------------------------------------------
// Integration test: full createApp composition with Map-backed KV binding
// ---------------------------------------------------------------------------

/**
 * Build a Map-backed raw KVNamespace binding that matches the Cloudflare KV interface
 * as seen by the kv plugin (binding is resolved off env, called with env-less methods).
 */
function makeRawKv() {
  const store = new Map<string, { value: string }>();
  return {
    SESSIONS_KV: {
      get: async (key: string) => store.get(key)?.value ?? null,
      put: async (key: string, value: string) => {
        store.set(key, { value });
      },
      delete: async (key: string) => {
        store.delete(key);
      },
      list: async () => ({ keys: [], list_complete: true, cursor: "" })
    } as unknown as KVNamespace,
    store
  };
}

/**
 * Build a fresh app instance with Map-backed sessions KV.
 * Returns the app and the env object.
 */
function createTestApp() {
  const { SESSIONS_KV } = makeRawKv();
  const env = { SESSIONS_KV } as unknown as WorkerEnv;
  const app = createApp({
    plugins: [kvPlugin, authPlugin],
    pluginConfigs: {
      kv: { sessions: { name: "atlas-sessions", binding: "SESSIONS_KV" } }
    }
  });
  return { app, env };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY tests (written first, per spec)
// ─────────────────────────────────────────────────────────────────────────────
describe("auth integration — SECURITY guard", () => {
  it("no-token request: isAuthed === false (guard → 401)", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/api/boards");
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });

  it("garbage Bearer token: isAuthed === false", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: "Bearer not-a-real-token" }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });

  it("garbage session cookie: isAuthed === false", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: "atlas_session=garbage" }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });

  it("/ws/* upgrade path — no token: isAuthed === false (guard runs before DO upgrade)", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/ws/board/1");
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });

  it("/ws/* upgrade path — garbage token: isAuthed === false", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/ws/board/1", {
      headers: { Authorization: "Bearer garbage-ws-token" }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// signIn → isAuthed round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe("auth integration — signIn → isAuthed", () => {
  it("signIn → isAuthed(Cookie) === true", async () => {
    const { app, env } = createTestApp();
    const session = await app.auth.signIn(env, { email: "a@b.com", password: "pw" });
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: `atlas_session=${session.token}` }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(true);
  });

  it("signIn → isAuthed(Bearer) === true", async () => {
    const { app, env } = createTestApp();
    const session = await app.auth.signIn(env, { email: "bearer@b.com", password: "pw" });
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(true);
  });

  it("after signOut → isAuthed === false", async () => {
    const { app, env } = createTestApp();
    const session = await app.auth.signIn(env, { email: "out@b.com", password: "pw" });
    await app.auth.signOut(env, session.token);
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: `atlas_session=${session.token}` }
    });
    expect(await app.auth.isAuthed(req, env)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// signUp
// ─────────────────────────────────────────────────────────────────────────────
describe("auth integration — signUp", () => {
  it("signUp records supplied display name and resolves the session", async () => {
    const { app, env } = createTestApp();
    const session = await app.auth.signUp(env, {
      email: "signup@b.com",
      password: "pw",
      name: "Test User"
    });
    expect(session.name).toBe("Test User");
    const resolved = await app.auth.resolveSession(env, session.token);
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe("Test User");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveActor
// ─────────────────────────────────────────────────────────────────────────────
describe("auth integration — resolveActor", () => {
  it("returns Actor for an authenticated request", async () => {
    const { app, env } = createTestApp();
    const session = await app.auth.signUp(env, {
      email: "actor@b.com",
      password: "pw",
      name: "My Actor"
    });
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const actor = await app.auth.resolveActor(req, env);
    expect(actor).not.toBeNull();
    expect(actor?.id).toBe(session.userId);
    expect(actor?.name).toBe("My Actor");
  });

  it("returns null for an unauthenticated request", async () => {
    const { app, env } = createTestApp();
    const req = new Request("https://x/api/boards");
    const actor = await app.auth.resolveActor(req, env);
    expect(actor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────
describe("type-level", () => {
  it("app.auth.isAuthed first parameter is typed as Request", () => {
    const { app } = createTestApp();
    expectTypeOf(app.auth.isAuthed).parameter(0).toEqualTypeOf<Request>();
  });

  it("app.auth conforms to the Api type", () => {
    const { app } = createTestApp();
    expectTypeOf(app.auth).toExtend<Api>();
  });

  it("Session shape is correct", () => {
    const session = {} as Session;
    expectTypeOf(session).toHaveProperty("userId");
    expectTypeOf(session).toHaveProperty("name");
    expectTypeOf(session).toHaveProperty("email");
    expectTypeOf(session).toHaveProperty("token");
    expectTypeOf(session).toHaveProperty("expiresAt");
  });
});
