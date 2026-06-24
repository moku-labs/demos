/* eslint-disable unicorn/no-null -- Cloudflare binding APIs + the nullable `color` column return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, d1Plugin } from "@moku-labs/worker";
import { describe, expect, it } from "vitest";

import { defaultColorFor } from "../../helpers";
import { usersPlugin } from "../../index";

// ---------------------------------------------------------------------------
// In-memory D1 fake — covers the single `users` table (write our own; no tracker)
// ---------------------------------------------------------------------------

/** Raw row shape for the in-memory users table. */
type UserRowRec = {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
  updated_at: number;
};

/**
 * Build a D1Database fake backed by an in-memory array for the users table.
 *
 * @returns `{ binding, userRows }` — the binding for the app + the rows for inspection.
 */
function makeD1Binding(): { binding: D1Database; userRows: UserRowRec[] } {
  const userRows: UserRowRec[] = [];

  const binding: D1Database = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },

        async first<T>(): Promise<T | null> {
          return null as T | null;
        },

        async all<T>(): Promise<D1Result<T>> {
          // SELECT ... FROM users WHERE id = ?  (getMe / updateProfile re-read)
          if (sql.includes("FROM users WHERE id = ?")) {
            const id = boundParams[0];
            const row = userRows.find(r => r.id === id);
            return {
              results: (row ? [row] : []) as unknown as T[],
              success: true,
              meta: {} as D1Result["meta"]
            };
          }
          // SELECT ... FROM users ORDER BY created_at  (list)
          if (sql.includes("FROM users ORDER BY created_at")) {
            const sorted = [...userRows].toSorted((a, b) => a.created_at - b.created_at);
            return {
              results: sorted as unknown as T[],
              success: true,
              meta: {} as D1Result["meta"]
            };
          }
          return { results: [] as T[], success: true, meta: {} as D1Result["meta"] };
        },

        async run(): Promise<D1Result> {
          if (sql.includes("INSERT INTO users")) {
            const [id, name, color, created_at, updated_at] = boundParams as [
              string,
              string,
              string | null,
              number,
              number
            ];
            const existing = userRows.find(r => r.id === id);
            if (sql.includes("DO UPDATE")) {
              // upsert: update name/colour/updated_at, preserve the original created_at
              if (existing) {
                existing.name = name;
                existing.color = color;
                existing.updated_at = updated_at;
              } else {
                userRows.push({ id, name, color, created_at, updated_at });
              }
            } else if (!existing) {
              // DO NOTHING: seed only when the row is absent
              userRows.push({ id, name, color, created_at, updated_at });
            }
          }
          return { results: [], success: true, meta: {} as D1Result["meta"] };
        }
      } as unknown as D1PreparedStatement;
    },

    async exec(_sql: string) {
      return { count: 0, duration: 0 } as D1ExecResult;
    },
    async batch<T>(_stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return [];
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
  } as unknown as D1Database;

  return { binding, userRows };
}

/**
 * Build a test app with the d1 + users plugins over the in-memory D1 fake.
 *
 * @returns `{ app, env, userRows }` for assertions.
 */
function createTestApp() {
  const { binding: db, userRows } = makeD1Binding();
  const env = { DB: db } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [d1Plugin, usersPlugin],
    pluginConfigs: {
      d1: { main: { name: "atlas-db", binding: "DB" } }
    }
  });

  return { app, env, userRows };
}

const actor = { id: "u_alice", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// getMe — seeds a selectable profile on first read; stable afterwards
// ─────────────────────────────────────────────────────────────────────────────
describe("users integration — getMe seeds a profile", () => {
  it("first getMe creates a selectable profile with a deterministic palette colour", async () => {
    const { app, env } = createTestApp();

    const me = await app.users.getMe(env, actor);

    expect(me.id).toBe(actor.id);
    expect(me.name).toBe("Alice");
    expect(me.color).toBe(defaultColorFor(actor.id));

    const all = await app.users.list(env);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(actor.id);
  });

  it("second getMe returns the same row without creating a duplicate", async () => {
    const { app, env, userRows } = createTestApp();

    const first = await app.users.getMe(env, actor);
    const second = await app.users.getMe(env, actor);

    expect(second).toEqual(first);
    expect(userRows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateProfile — upsert round-trips through getMe / list
// ─────────────────────────────────────────────────────────────────────────────
describe("users integration — updateProfile round-trip", () => {
  it("updateProfile upserts and getMe reads it back", async () => {
    const { app, env } = createTestApp();

    await app.users.getMe(env, actor); // seed the default row
    const updated = await app.users.updateProfile(env, actor, {
      name: "Ada",
      color: "--label-purple"
    });

    expect(updated.name).toBe("Ada");
    expect(updated.color).toBe("--label-purple");

    const me = await app.users.getMe(env, actor);
    expect(me.name).toBe("Ada");
    expect(me.color).toBe("--label-purple");
  });

  it("updateProfile preserves the original created_at and can clear the colour", async () => {
    const { app, env } = createTestApp();

    const seeded = await app.users.getMe(env, actor);
    const updated = await app.users.updateProfile(env, actor, { name: "Ada", color: null });

    expect(updated.createdAt).toBe(seeded.createdAt);
    expect(updated.color).toBeNull();
  });

  it("updateProfile before any getMe still creates the row (upsert-insert path)", async () => {
    const { app, env, userRows } = createTestApp();

    const me = await app.users.updateProfile(env, actor, { name: "Solo", color: "--avatar-ml" });

    expect(me.name).toBe("Solo");
    expect(userRows).toHaveLength(1);

    const all = await app.users.list(env);
    expect(all[0]?.name).toBe("Solo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// list — empty + oldest-first ordering
// ─────────────────────────────────────────────────────────────────────────────
describe("users integration — list", () => {
  it("returns an empty array before any profile exists", async () => {
    const { app, env } = createTestApp();

    expect(await app.users.list(env)).toEqual([]);
  });

  it("returns every persisted user, oldest first", async () => {
    const { app, env } = createTestApp();

    await app.users.getMe(env, { id: "u_1", name: "One" });
    await app.users.getMe(env, { id: "u_2", name: "Two" });
    await app.users.getMe(env, { id: "u_3", name: "Three" });

    const all = await app.users.list(env);
    expect(all.map(u => u.id)).toEqual(["u_1", "u_2", "u_3"]);
  });
});
