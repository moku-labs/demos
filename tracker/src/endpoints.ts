/**
 * @file Tracker HTTP + WebSocket endpoint table — the worker's whole routing surface, in one place.
 *
 * Each entry is a declarative `endpoint(path).method(handler)` from `@moku-labs/worker`, grouped by
 * resource (health · boards · columns · cards · attachments · live). Handlers are deliberately thin:
 * read params/body/headers off `ctx`, delegate to the `tracker` plugin (or a resource plugin) via
 * `ctx.require`, and return a `Response`. Every D1 / KV / Queues / R2 / Durable-Object side effect
 * lives inside those plugins, never here.
 *
 * `src/server.ts` consumes this array as `server: { endpoints }` and `server.server.handle` dispatches it
 * (most-specific path wins). Each comment states three things:
 *   • expects — path params / request body / headers the handler reads
 *   • does    — the one-line action (the header line after the method + path)
 *   • returns — status code + JSON/stream shape on success (and notable error statuses)
 */

import type { Server } from "@moku-labs/worker";
import { d1Plugin, durableObjectsPlugin, endpoint } from "@moku-labs/worker";
import type { CardMove, CardPatch, NewBoard, NewCard, NewColumn } from "./lib/types";
import { trackerPlugin } from "./plugins/tracker";

/** Fallback attachment filename when an upload omits the `x-filename` header. */
const DEFAULT_FILENAME = "upload.bin";
/** Fallback attachment content type when an upload omits a `content-type` header. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * The Tracker endpoint table, grouped by resource. Wired into the worker app via `server: { endpoints }`
 * and dispatched by `server.server.handle`. See the file header for the per-endpoint comment convention.
 *
 * @example
 * ```ts
 * import { endpoints } from "./endpoints";
 * createApp({ pluginConfigs: { server: { endpoints } } });
 * ```
 */
export const endpoints: Server.Endpoint[] = [
  // ── Health ──────────────────────────────────────────────────────────────
  // GET /health — liveness probe.
  //   expects : —
  //   returns : 200 · text/plain "ok"
  endpoint("/health").get(() => new Response("ok")),

  // ── Boards ──────────────────────────────────────────────────────────────
  // GET /api/boards — list every board.
  //   expects : —
  //   returns : 200 · BoardSummary[]   (served from the KV index, D1 fallback on a cache miss)
  endpoint("/api/boards").get(async ctx =>
    Response.json(await ctx.require(trackerPlugin).listBoards(ctx.env))
  ),
  // POST /api/boards — create a board (seeds the default To Do / In Progress / Done columns).
  //   expects : JSON body NewBoard { title }
  //   returns : 201 · Board
  endpoint("/api/boards").post(async ctx => {
    const input = (await ctx.request.json()) as NewBoard;
    return Response.json(await ctx.require(trackerPlugin).createBoard(ctx.env, input), {
      status: 201
    });
  }),
  // GET /api/boards/{id} — full board snapshot (board + columns + cards).
  //   expects : path {id}
  //   returns : 200 · BoardSnapshot   ·   404 "not found" when the board is unknown
  endpoint("/api/boards/{id}").get(async ctx => {
    const snapshot = await ctx.require(trackerPlugin).getBoard(ctx.env, ctx.params.id);
    if (!snapshot) return new Response("not found", { status: 404 });
    return Response.json(snapshot);
  }),
  // GET /api/boards/{id}/activity — recent activity feed for a board (newest first, max 50).
  //   expects : path {id}
  //   returns : 200 · Activity[]
  endpoint("/api/boards/{id}/activity").get(async ctx =>
    Response.json(await ctx.require(trackerPlugin).listActivity(ctx.env, ctx.params.id))
  ),

  // ── Columns ─────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/columns — append a column at the next free position.
  //   expects : path {id} · JSON body NewColumn { title }
  //   returns : 201 · Column   (broadcasts column.created to live clients)
  endpoint("/api/boards/{id}/columns").post(async ctx => {
    const input = (await ctx.request.json()) as NewColumn;
    const column = await ctx.require(trackerPlugin).createColumn(ctx.env, ctx.params.id, input);
    return Response.json(column, { status: 201 });
  }),

  // ── Cards ───────────────────────────────────────────────────────────────
  // POST /api/boards/{id}/cards — create a card inside a column.
  //   expects : path {id} · JSON body NewCard & { columnId } → { columnId, title, description? }
  //   returns : 201 · Card   (enqueues card.created activity, broadcasts to live clients)
  endpoint("/api/boards/{id}/cards").post(async ctx => {
    const { columnId, ...input } = (await ctx.request.json()) as NewCard & { columnId: string };
    const card = await ctx
      .require(trackerPlugin)
      .createCard(ctx.env, ctx.params.id, columnId, input);
    return Response.json(card, { status: 201 });
  }),
  // PATCH /api/boards/{id}/cards/{cid} — edit a card's title and/or description.
  //   expects : path {id, cid} · JSON body CardPatch { title?, description? }
  //   returns : 200 · Card   (an empty patch is a no-op — no activity/broadcast)
  endpoint("/api/boards/{id}/cards/{cid}").patch(async ctx => {
    const patch = (await ctx.request.json()) as CardPatch;
    const card = await ctx
      .require(trackerPlugin)
      .updateCard(ctx.env, ctx.params.id, ctx.params.cid, patch);
    return Response.json(card);
  }),
  // DELETE /api/boards/{id}/cards/{cid} — delete a card.
  //   expects : path {id, cid}
  //   returns : 200 · { ok: true }   (enqueues card.deleted activity, broadcasts)
  endpoint("/api/boards/{id}/cards/{cid}").delete(async ctx => {
    await ctx.require(trackerPlugin).deleteCard(ctx.env, ctx.params.id, ctx.params.cid);
    return Response.json({ ok: true });
  }),
  // POST /api/boards/{id}/cards/{cid}/move — move a card to a target column + position.
  //   expects : path {id, cid} · JSON body CardMove { toColumnId, position }
  //   returns : 200 · Card   (enqueues card.moved activity, broadcasts)
  endpoint("/api/boards/{id}/cards/{cid}/move").post(async ctx => {
    const move = (await ctx.request.json()) as CardMove;
    const card = await ctx
      .require(trackerPlugin)
      .moveCard(ctx.env, ctx.params.id, ctx.params.cid, move);
    return Response.json(card);
  }),

  // ── Attachments (R2 blob + D1 metadata) ─────────────────────────────────
  // POST /api/boards/{id}/cards/{cid}/attachments — upload a card attachment.
  //   expects : path {id, cid} · raw body bytes · headers x-filename? + content-type? (both optional)
  //   returns : 201 · Attachment   (blob → R2, metadata → D1; broadcasts attachment.added)
  endpoint("/api/boards/{id}/cards/{cid}/attachments").post(async ctx => {
    const filename = ctx.request.headers.get("x-filename") ?? DEFAULT_FILENAME;
    const contentType = ctx.request.headers.get("content-type") ?? DEFAULT_CONTENT_TYPE;
    const fileBody = await ctx.request.arrayBuffer();
    const attachment = await ctx
      .require(trackerPlugin)
      .addAttachment(ctx.env, ctx.params.id, ctx.params.cid, {
        filename,
        contentType,
        body: fileBody
      });
    return Response.json(attachment, { status: 201 });
  }),
  // GET /api/attachments/{id} — download an attachment blob.
  //   expects : path {id} (attachment id)
  //   returns : 200 · the R2 blob streamed with its stored content-type, forced as a download
  //             (Content-Disposition: attachment) so uploaded HTML/SVG can never execute as stored
  //             XSS in the worker origin   ·   404 "not found" when metadata or blob is missing
  endpoint("/api/attachments/{id}").get(async ctx => {
    // R2 stores no content type (D8) — read it from D1, then stream the blob with that header.
    const meta = await ctx
      .require(d1Plugin)
      .first<{ key: string; content_type: string; filename: string }>(
        ctx.env,
        "SELECT key, content_type, filename FROM attachments WHERE id = ?",
        ctx.params.id
      );
    if (!meta) return new Response("not found", { status: 404 });
    const object = await ctx.require(trackerPlugin).getAttachmentBody(ctx.env, meta.key);
    if (!object) return new Response("not found", { status: 404 });
    // Force download (never inline-render) so an uploaded HTML/SVG cannot execute as stored
    // XSS in the worker origin; strip header-breaking characters from the filename.
    const safeName = meta.filename.replaceAll(/["\r\n]/g, "");
    return new Response(object.body, {
      headers: {
        "content-type": meta.content_type,
        "content-disposition": `attachment; filename="${safeName}"`
      }
    });
  }),

  // ── Live (WebSocket) ────────────────────────────────────────────────────
  // GET /ws/board/{id} — open the live channel for a board.
  //   expects : path {id} · a WebSocket upgrade request (Upgrade: websocket)
  //   returns : 101 Switching Protocols — the upgrade is forwarded to the per-board Durable Object,
  //             which owns connection hibernation + patch fan-out to every connected client
  endpoint("/ws/board/{id}").get(ctx =>
    ctx.require(durableObjectsPlugin).get(ctx.env, "board", ctx.params.id).fetch(ctx.request)
  )
];
