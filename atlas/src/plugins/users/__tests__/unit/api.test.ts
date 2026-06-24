/* eslint-disable unicorn/no-null -- the users `color` column is nullable by contract (clears to NULL) */
import { d1Plugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { User } from "../../../../lib/types";
import { createUsersApi } from "../../api";
import { defaultColorFor } from "../../helpers";
import type { UsersCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit tests: createUsersApi (mock context, no kernel)
// ---------------------------------------------------------------------------

/** Minimal D1 api mock shape — the users plugin only calls `query` + `run`. */
type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: { d1Api?: Partial<D1ApiMock> }): {
  ctx: UsersCtx;
  d1Api: D1ApiMock;
} {
  const d1Api: D1ApiMock = {
    query: vi.fn(async () => ({ results: [] })),
    run: vi.fn(async () => ({})),
    ...overrides?.d1Api
  };

  // UsersCtx is a narrow structural slice — the api only needs the `require`
  // resolver (no config, events, or state), so the mock provides exactly that.
  const ctx = {
    require: (p: unknown) => (p === d1Plugin ? d1Api : undefined)
  } as unknown as UsersCtx;

  return { ctx, d1Api };
}

const actor = { id: "u_alice", name: "Alice" };
const mockEnv = {} as Parameters<ReturnType<typeof createUsersApi>["list"]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// getMe — first read seeds a default row; later reads return the stored row
// ─────────────────────────────────────────────────────────────────────────────
describe("createUsersApi — getMe", () => {
  it("selects the profile by the actor's id", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createUsersApi(ctx);

    await api.getMe(mockEnv, actor);

    expect(d1Api.query).toHaveBeenCalledOnce();
    const callArgs = d1Api.query.mock.calls[0] as unknown[];
    expect(callArgs[1] as string).toMatch(/FROM users WHERE id = \?/i);
    expect(callArgs[2]).toBe(actor.id);
  });

  it("first read: inserts a default row (ON CONFLICT DO NOTHING) with a deterministic colour", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createUsersApi(ctx);

    const me = await api.getMe(mockEnv, actor);

    expect(d1Api.run).toHaveBeenCalledOnce();
    const insertArgs = d1Api.run.mock.calls[0] as unknown[];
    const insertSql = insertArgs[1] as string;
    expect(insertSql).toMatch(/INSERT INTO users/i);
    expect(insertSql).toMatch(/ON CONFLICT\(id\) DO NOTHING/i);
    expect(insertArgs).toContain(actor.id);
    expect(insertArgs).toContain(defaultColorFor(actor.id));

    // The returned profile carries the actor's name + the seeded colour + equal timestamps.
    expect(me.id).toBe(actor.id);
    expect(me.name).toBe(actor.name);
    expect(me.color).toBe(defaultColorFor(actor.id));
    expect(typeof me.createdAt).toBe("number");
    expect(me.updatedAt).toBe(me.createdAt);
  });

  it("second read: returns the existing row (mapped) without inserting", async () => {
    const existingRow = {
      id: actor.id,
      name: "Ada",
      color: "--label-green",
      created_at: 1_700_000_000,
      updated_at: 1_700_000_500
    };
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [existingRow] })) }
    });
    const api = createUsersApi(ctx);

    const me = await api.getMe(mockEnv, actor);

    expect(d1Api.run).not.toHaveBeenCalled();
    expect(me).toEqual({
      id: actor.id,
      name: "Ada",
      color: "--label-green",
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_500
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateProfile — upsert then re-read the persisted row
// ─────────────────────────────────────────────────────────────────────────────
describe("createUsersApi — updateProfile", () => {
  it("upserts via ON CONFLICT DO UPDATE with the chosen name + colour", async () => {
    const reread = {
      id: actor.id,
      name: "Ada Lovelace",
      color: "--label-purple",
      created_at: 1000,
      updated_at: 2000
    };
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [reread] })) }
    });
    const api = createUsersApi(ctx);

    const me = await api.updateProfile(mockEnv, actor, {
      name: "Ada Lovelace",
      color: "--label-purple"
    });

    expect(d1Api.run).toHaveBeenCalledOnce();
    const upsertArgs = d1Api.run.mock.calls[0] as unknown[];
    expect(upsertArgs[1] as string).toMatch(/INSERT INTO users/i);
    expect(upsertArgs[1] as string).toMatch(/ON CONFLICT\(id\) DO UPDATE/i);
    expect(upsertArgs).toContain("Ada Lovelace");
    expect(upsertArgs).toContain("--label-purple");

    // It re-reads the row and returns the persisted (mapped) values.
    expect(d1Api.query).toHaveBeenCalledOnce();
    expect(me).toEqual({
      id: actor.id,
      name: "Ada Lovelace",
      color: "--label-purple",
      createdAt: 1000,
      updatedAt: 2000
    });
  });

  it("passes a null colour through to clear it", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [{ id: actor.id, name: "Bo", color: null, created_at: 1, updated_at: 2 }]
        }))
      }
    });
    const api = createUsersApi(ctx);

    const me = await api.updateProfile(mockEnv, actor, { name: "Bo", color: null });

    expect(d1Api.run.mock.calls[0] as unknown[]).toContain(null);
    expect(me.color).toBeNull();
  });

  it("falls back to the input when the re-read returns nothing", async () => {
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createUsersApi(ctx);

    const me = await api.updateProfile(mockEnv, actor, { name: "Cy", color: "--avatar-ak" });

    expect(me.id).toBe(actor.id);
    expect(me.name).toBe("Cy");
    expect(me.color).toBe("--avatar-ak");
    expect(typeof me.createdAt).toBe("number");
    expect(me.updatedAt).toBe(me.createdAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// list — every persisted user, oldest first
// ─────────────────────────────────────────────────────────────────────────────
describe("createUsersApi — list", () => {
  it("selects all users ordered by created_at", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createUsersApi(ctx);

    await api.list(mockEnv);

    expect(d1Api.query).toHaveBeenCalledOnce();
    expect((d1Api.query.mock.calls[0] as unknown[])[1] as string).toMatch(
      /FROM users ORDER BY created_at/i
    );
  });

  it("maps snake_case rows to camelCase User objects", async () => {
    const rows = [
      { id: "u_a", name: "A", color: "--avatar-ak", created_at: 10, updated_at: 11 },
      { id: "u_b", name: "B", color: null, created_at: 20, updated_at: 21 }
    ];
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: rows })) }
    });
    const api = createUsersApi(ctx);

    const users = await api.list(mockEnv);

    expect(users).toEqual([
      { id: "u_a", name: "A", color: "--avatar-ak", createdAt: 10, updatedAt: 11 },
      { id: "u_b", name: "B", color: null, createdAt: 20, updatedAt: 21 }
    ]);
  });

  it("returns an empty array when no users exist", async () => {
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createUsersApi(ctx);

    expect(await api.list(mockEnv)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// type-level — the env-first Api surface infers through createUsersApi
// ─────────────────────────────────────────────────────────────────────────────
describe("createUsersApi — types", () => {
  it("exposes reads that resolve to User / User[]", () => {
    const { ctx } = createMockCtx();
    const api = createUsersApi(ctx);

    expectTypeOf(api.getMe).returns.resolves.toEqualTypeOf<User>();
    expectTypeOf(api.updateProfile).returns.resolves.toEqualTypeOf<User>();
    expectTypeOf(api.list).returns.resolves.toEqualTypeOf<User[]>();
  });
});
