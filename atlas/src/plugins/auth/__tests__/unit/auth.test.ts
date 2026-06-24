/* eslint-disable unicorn/no-null -- mocking Cloudflare binding APIs that return null by contract */
/* eslint-disable sonarjs/no-hardcoded-passwords -- test credentials are intentionally literal demo values, not real secrets */

import type { WorkerEnv } from "@moku-labs/worker";

import { kvPlugin } from "@moku-labs/worker";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthApi } from "../../api";
import type { Api, AuthCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: createAuthApi (mock context, in-memory KV, no kernel)
// ---------------------------------------------------------------------------

/**
 * Build an in-memory KV namespace mock backed by a Map.
 * The `use()` method always returns the same namespace stub.
 */
function makeKv() {
  const store = new Map<string, string>();
  const ns = {
    get: vi.fn(async (_env: unknown, key: string) => store.get(key) ?? null),
    put: vi.fn(async (_env: unknown, key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (_env: unknown, key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" }))
  };
  return { ns, store };
}

// Fresh KV store + api per test — no shared mutable state bleeding across cases (each test starts clean).
let ns: ReturnType<typeof makeKv>["ns"];
let kvApi: ReturnType<typeof makeKv>["ns"] & { use: ReturnType<typeof vi.fn> };
let api: ReturnType<typeof createAuthApi>;
let env: WorkerEnv;

beforeEach(() => {
  ({ ns } = makeKv());
  kvApi = { ...ns, use: vi.fn(() => ns) };
  const ctx = {
    config: { sessionsKv: "sessions", ttlSeconds: 86_400, cookieName: "atlas_session" },
    state: {},
    require: vi.fn((p: unknown) => (p === kvPlugin ? kvApi : undefined))
  } as unknown as AuthCtx;
  api = createAuthApi(ctx);
  env = {} as WorkerEnv;
});

// UUID regex for token validation
const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// signIn
// ─────────────────────────────────────────────────────────────────────────────
describe("signIn", () => {
  it("mints a UUID v4 token", async () => {
    const session = await api.signIn(env, { email: "user@example.com", password: "pw123" });
    expect(session.token).toMatch(UUID_REGEX);
  });

  it("stores a record with a future expiresAt", async () => {
    const before = Date.now();
    const session = await api.signIn(env, { email: "user2@example.com", password: "abc" });
    expect(session.expiresAt).toBeGreaterThan(before);
  });

  it("echoes the email and derives a name from the email local part when name is absent", async () => {
    const session = await api.signIn(env, { email: "alice@domain.org", password: "pw" });
    expect(session.email).toBe("alice@domain.org");
    expect(session.name).toBe("alice");
  });

  it("throws on invalid email shape", async () => {
    await expect(api.signIn(env, { email: "not-an-email", password: "pw" })).rejects.toThrow();
  });

  it("throws on empty password", async () => {
    await expect(api.signIn(env, { email: "user@example.com", password: "" })).rejects.toThrow();
  });

  it("throws on whitespace-only password", async () => {
    await expect(api.signIn(env, { email: "user@example.com", password: "   " })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// signUp
// ─────────────────────────────────────────────────────────────────────────────
describe("signUp", () => {
  it("records the supplied display name", async () => {
    const session = await api.signUp(env, {
      email: "bob@example.com",
      password: "pw",
      name: "Bob Smith"
    });
    expect(session.name).toBe("Bob Smith");
  });

  it("falls back to email local part when name is absent", async () => {
    const session = await api.signUp(env, { email: "carol@example.com", password: "pw" });
    expect(session.name).toBe("carol");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// userId derivation
// ─────────────────────────────────────────────────────────────────────────────
describe("userId derivation", () => {
  it("is stable — same email produces same userId across two calls", async () => {
    const s1 = await api.signIn(env, { email: "stable@test.com", password: "pw" });
    const s2 = await api.signIn(env, { email: "stable@test.com", password: "pw" });
    expect(s1.userId).toBe(s2.userId);
  });

  it("never equals the raw email", async () => {
    const session = await api.signIn(env, { email: "pii@test.com", password: "pw" });
    expect(session.userId).not.toBe("pii@test.com");
    expect(session.userId).not.toContain("pii@test.com");
  });

  it("starts with u_ prefix (opaque id marker)", async () => {
    const session = await api.signIn(env, { email: "prefix@test.com", password: "pw" });
    expect(session.userId).toMatch(/^u_/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSession
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveSession", () => {
  it("returns null for an absent token", async () => {
    const result = await api.resolveSession(env, "no-such-token");
    expect(result).toBeNull();
  });

  it("returns null for a falsy token", async () => {
    const result = await api.resolveSession(env, "");
    expect(result).toBeNull();
  });

  it("returns the session for a valid unexpired token (round-trip with signIn)", async () => {
    const session = await api.signIn(env, { email: "roundtrip@test.com", password: "pw" });
    const resolved = await api.resolveSession(env, session.token);
    expect(resolved).not.toBeNull();
    expect(resolved?.userId).toBe(session.userId);
    expect(resolved?.email).toBe(session.email);
  });

  it("returns null for an expired record and deletes the KV key", async () => {
    // Write a record with expiresAt already in the past directly via kvApi
    const expiredToken = "expired-token-abc";
    const record = JSON.stringify({
      userId: "u_dead",
      name: "Dead",
      email: "dead@test.com",
      expiresAt: Date.now() - 1000 // 1 second in the past
    });
    ns.put.mockImplementationOnce(async () => {});
    await kvApi.put(env, expiredToken, record);
    // Ensure the store has the key
    ns.get.mockImplementationOnce(async () => record);
    const deleteSpy = vi.spyOn(ns, "delete");
    const result = await api.resolveSession(env, expiredToken);
    expect(result).toBeNull();
    expect(deleteSpy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isAuthed
// ─────────────────────────────────────────────────────────────────────────────
describe("isAuthed", () => {
  it("returns true for a request with a valid session cookie", async () => {
    const session = await api.signIn(env, { email: "cookie@test.com", password: "pw" });
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: `atlas_session=${session.token}` }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(true);
  });

  it("returns true for a request with a valid Authorization Bearer token", async () => {
    const session = await api.signIn(env, { email: "bearer@test.com", password: "pw" });
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(true);
  });

  it("returns false for a request with no token", async () => {
    const req = new Request("https://x/api/boards");
    const result = await api.isAuthed(req, env);
    expect(result).toBe(false);
  });

  it("returns false for a garbage Bearer token", async () => {
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: "Bearer not-a-real-token" }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(false);
  });

  it("returns false for a garbage session cookie", async () => {
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: "atlas_session=garbage" }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(false);
  });

  it("parses the cookie from a multi-cookie header", async () => {
    const session = await api.signIn(env, { email: "multicookie@test.com", password: "pw" });
    const req = new Request("https://x/api/boards", {
      headers: { Cookie: `other=val; atlas_session=${session.token}; another=x` }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveActor
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveActor", () => {
  it("returns Actor (id+name) for an authenticated request", async () => {
    const session = await api.signIn(env, {
      email: "actor@test.com",
      password: "pw",
      name: "Actor User"
    });
    const req = new Request("https://x/api/boards", {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const actor = await api.resolveActor(req, env);
    expect(actor).not.toBeNull();
    expect(actor?.id).toBe(session.userId);
    expect(actor?.name).toBe("Actor User");
  });

  it("returns null for an unauthenticated request", async () => {
    const req = new Request("https://x/api/boards");
    const actor = await api.resolveActor(req, env);
    expect(actor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// signOut
// ─────────────────────────────────────────────────────────────────────────────
describe("signOut", () => {
  it("deletes the session — resolveSession returns null afterward", async () => {
    const session = await api.signIn(env, { email: "signout@test.com", password: "pw" });
    await api.signOut(env, session.token);
    const resolved = await api.resolveSession(env, session.token);
    expect(resolved).toBeNull();
  });

  it("is idempotent — calling twice does not throw", async () => {
    const session = await api.signIn(env, { email: "idempotent@test.com", password: "pw" });
    await api.signOut(env, session.token);
    await expect(api.signOut(env, session.token)).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /ws/* guard path
// ─────────────────────────────────────────────────────────────────────────────
describe("WebSocket upgrade guard", () => {
  it("returns false for a /ws/* request with no token", async () => {
    const req = new Request("https://x/ws/board/1");
    const result = await api.isAuthed(req, env);
    expect(result).toBe(false);
  });

  it("returns false for a /ws/* request with a garbage token", async () => {
    const req = new Request("https://x/ws/board/1", {
      headers: { Authorization: "Bearer garbage-ws-token" }
    });
    const result = await api.isAuthed(req, env);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────
describe("type-level", () => {
  it("isAuthed first parameter is typed as Request", () => {
    expectTypeOf(api.isAuthed).parameter(0).toEqualTypeOf<Request>();
  });

  it("signIn returns Promise<Session>", async () => {
    const result = api.signIn(env, { email: "type@test.com", password: "pw" });
    expectTypeOf(result).resolves.toHaveProperty("token");
    expectTypeOf(result).resolves.toHaveProperty("userId");
    expectTypeOf(result).resolves.toHaveProperty("email");
    expectTypeOf(result).resolves.toHaveProperty("name");
    expectTypeOf(result).resolves.toHaveProperty("expiresAt");
  });

  it("resolveActor returns Promise<Actor | null>", () => {
    expectTypeOf(api.resolveActor).returns.resolves.toEqualTypeOf<{
      id: string;
      name: string;
    } | null>();
  });

  it("api conforms to Api type", () => {
    expectTypeOf(api).toExtend<Api>();
  });
});
