/**
 * @file Worker endpoint integration — drives the real Cloudflare default export (`src/worker.ts`)
 * through every route over fake bindings, asserting the proof-loop primitives fire (D1 persist,
 * Queue enqueue, Durable Object broadcast) and that non-API paths fall through to Static Assets.
 */
import { describe, expect, it } from "vitest";
import worker from "../../src/cloudflare/worker";
import { server } from "../../src/server";
import { makeExecCtx, makeFakeEnv } from "./_cf-fakes";

/**
 * Route a request through the worker's default `fetch` (which branches `/api` + `/ws` to the
 * server and everything else to `env.ASSETS`).
 */
function fetchWorker(env: Record<string, unknown>, input: string, init?: RequestInit) {
  return worker.fetch(new Request(input, init), env as never, makeExecCtx());
}

describe("worker endpoints (proof loop)", () => {
  it("exposes the composed tracker api on the server", () => {
    expect(typeof server.tracker.createCard).toBe("function");
  });

  it("GET /health (liveness probe) returns ok through the default fetch", async () => {
    // /health is a server endpoint reached through the worker's default fetch — the route guard
    // forwards it to server.server.handle alongside /api + /ws (it does not fall through to ASSETS).
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(spies.assetsFetch).not.toHaveBeenCalled();
  });

  it("GET /api/boards lists boards (KV miss → D1 fallback)", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards");
    expect(res.status).toBe(200);
    expect(spies.kvGet).toHaveBeenCalled();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("POST /api/boards creates a board (D1 + KV) → 201", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards", {
      method: "POST",
      body: JSON.stringify({ title: "Sprint 1" })
    });
    expect(res.status).toBe(201);
    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("insert into boards"))).toBe(true);
    expect(spies.kvPut).toHaveBeenCalled();
  });

  it("GET /api/boards/{id} returns a snapshot when found", async () => {
    const { env } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1");
    expect(res.status).toBe(200);
    const snap = (await res.json()) as { board: { id: string }; columns: unknown[] };
    expect(snap.board.id).toBe("board-1");
  });

  it("GET /api/boards/{id} returns 404 when the board is absent", async () => {
    const { env } = makeFakeEnv({ empty: true });
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/missing");
    expect(res.status).toBe(404);
  });

  it("GET /api/boards/{id}/activity lists activity", async () => {
    const { env } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/activity");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("POST /api/boards/{id}/columns creates a column + broadcasts → 201", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/columns", {
      method: "POST",
      body: JSON.stringify({ title: "Review" })
    });
    expect(res.status).toBe(201);
    expect(spies.doFetch).toHaveBeenCalled();
  });

  it("POST /api/boards/{id}/cards persists, enqueues activity, and broadcasts → 201", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards", {
      method: "POST",
      body: JSON.stringify({ columnId: "col-1", title: "Implement login" })
    });
    expect(res.status).toBe(201);
    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("insert into cards"))).toBe(true);
    expect(spies.queueSend).toHaveBeenCalled();
    const queued = spies.queueSend.mock.calls[0]?.[0] as { entry: { kind: string } };
    expect(queued.entry.kind).toBe("card.created");
    const broadcast = JSON.parse(spies.doFetch.mock.calls.at(-1)?.[1]?.body as string);
    expect(broadcast.type).toBe("card.created");
  });

  it("PATCH /api/boards/{id}/cards/{cid} updates a card", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards/card-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Revised" })
    });
    expect(res.status).toBe(200);
    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("update cards"))).toBe(true);
  });

  it("POST /api/boards/{id}/cards/{cid}/move moves a card + broadcasts card.moved", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards/card-1/move", {
      method: "POST",
      body: JSON.stringify({ toColumnId: "col-2", position: 1 })
    });
    expect(res.status).toBe(200);
    const broadcast = JSON.parse(spies.doFetch.mock.calls.at(-1)?.[1]?.body as string);
    expect(broadcast.type).toBe("card.moved");
  });

  it("DELETE /api/boards/{id}/cards/{cid} deletes a card", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards/card-1", {
      method: "DELETE"
    });
    expect(res.status).toBe(200);
    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("delete from cards"))).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("POST .../attachments stores the blob in R2 + metadata in D1 → 201", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(
      env,
      "https://tracker.dev/api/boards/board-1/cards/card-1/attachments",
      {
        method: "POST",
        headers: { "x-filename": "note.txt", "content-type": "text/plain" },
        body: "data"
      }
    );
    expect(res.status).toBe(201);
    expect(spies.storagePut).toHaveBeenCalled();
    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("insert into attachments"))).toBe(
      true
    );
  });

  it("GET /api/attachments/{id} streams the blob as a forced download", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/attachments/att-1");
    expect(res.status).toBe(200);
    expect(spies.storageGet).toHaveBeenCalled();
    // XSS-safe: never inline-rendered (W2-D5).
    expect(res.headers.get("content-disposition")).toContain("attachment;");
  });

  it("GET /api/attachments/{id} returns 404 when metadata is absent", async () => {
    const { env } = makeFakeEnv({ empty: true });
    const res = await fetchWorker(env, "https://tracker.dev/api/attachments/missing");
    expect(res.status).toBe(404);
  });

  it("GET /ws/board/{id} forwards the request to the Board Durable Object", async () => {
    const { env, spies } = makeFakeEnv();
    await fetchWorker(env, "https://tracker.dev/ws/board/board-1", {
      headers: { upgrade: "websocket" }
    });
    expect(spies.doFetch).toHaveBeenCalled();
  });

  it("board deep-link paths fall through to Static Assets (SPA client routing)", async () => {
    // The worker is path-agnostic for non-API/WS paths: every board deep link (/board/{id} and its
    // /card/{cardId} + /activity children) is served the SPA shell from env.ASSETS, which boots and
    // renders the matched route — so a shared link to any place lands the viewer there.
    for (const path of ["/board/b-1", "/board/b-1/card/c-9", "/board/b-1/activity"]) {
      const { env, spies } = makeFakeEnv();
      const res = await fetchWorker(env, `https://tracker.dev${path}`);
      expect(spies.assetsFetch).toHaveBeenCalled();
      expect(res.status).toBe(200);
    }
  });

  it("GET /api/attachments/{id} 404s when metadata exists but the R2 blob is gone", async () => {
    // meta present (D1 returns the row) but the blob is absent — exercises the `!object` branch.
    const { env, spies } = makeFakeEnv();
    // eslint-disable-next-line unicorn/no-null -- R2 get() returns null by contract on a miss
    spies.storageGet.mockResolvedValueOnce(null);
    const res = await fetchWorker(env, "https://tracker.dev/api/attachments/att-1");
    expect(res.status).toBe(404);
  });
});

// When a read-after-write returns null (a real edge: D1 settled the write but the follow-up SELECT
// missed), the tracker falls back to a synthetic row built from the inputs rather than crashing.
// Driving the write endpoints with empty reads exercises those `?? { …synthetic }` fallback branches.
describe("worker endpoints — read-after-write fallback rows", () => {
  it("create/move/update/delete still succeed and broadcast when reads return null", async () => {
    const { env, spies } = makeFakeEnv({ empty: true });

    const created = await fetchWorker(env, "https://tracker.dev/api/boards", {
      method: "POST",
      body: JSON.stringify({ title: "Sprint" })
    });
    expect(created.status).toBe(201);

    const column = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/columns", {
      method: "POST",
      body: JSON.stringify({ title: "To Do" })
    });
    expect(column.status).toBe(201);

    const card = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards", {
      method: "POST",
      body: JSON.stringify({ columnId: "col-1", title: "Task" })
    });
    expect(card.status).toBe(201);

    const moved = await fetchWorker(
      env,
      "https://tracker.dev/api/boards/board-1/cards/card-1/move",
      {
        method: "POST",
        body: JSON.stringify({ toColumnId: "col-2", position: 0 })
      }
    );
    expect(moved.status).toBe(200);

    const patched = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards/card-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed", description: "d" })
    });
    expect(patched.status).toBe(200);

    const attachment = await fetchWorker(
      env,
      "https://tracker.dev/api/boards/board-1/cards/card-1/attachments",
      { method: "POST", headers: { "x-filename": "a.txt" }, body: "x" }
    );
    expect(attachment.status).toBe(201);

    // The proof loop still fired end-to-end despite the missed reads.
    expect(spies.queueSend).toHaveBeenCalled();
    expect(spies.doFetch).toHaveBeenCalled();
  });

  it("PATCH with an empty patch is a no-op (no activity/broadcast)", async () => {
    const { env, spies } = makeFakeEnv();
    const res = await fetchWorker(env, "https://tracker.dev/api/boards/board-1/cards/card-1", {
      method: "PATCH",
      body: JSON.stringify({})
    });
    expect(res.status).toBe(200);
    expect(spies.queueSend).not.toHaveBeenCalled();
  });
});
