/**
 * @file Worker entry — composes `@moku-labs/worker` and exports the Cloudflare default handler.
 *
 * `fetch` branches `/api/*` + `/ws/*` to the server router (the tracker endpoints) and serves
 * everything else from Cloudflare Static Assets (`env.ASSETS`, the built web client). `queue` drains
 * the activity queue through the late-bound app closure (D8). The Board DO class is re-exported so
 * the runtime can instantiate it. Endpoint handlers stay thin: read params/body, call the tracker
 * api, return a `Response` — the worker primitives (D1, KV, Queues, R2, DO) fire inside `tracker`.
 */

import type { WorkerEnv } from "@moku-labs/worker";
import {
  createApp,
  d1Plugin,
  durableObjectsPlugin,
  endpoint,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import type {
  ActivityMessage,
  CardMove,
  CardPatch,
  NewBoard,
  NewCard,
  NewColumn
} from "./lib/types";
import { trackerPlugin } from "./plugins/tracker";

/** Default attachment filename when the upload omits the `x-filename` header. */
const DEFAULT_FILENAME = "upload.bin";
/** Default attachment content type when the upload omits one. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * The Tracker worker server app — composes the five `@moku-labs/worker` resource plugins (kv, d1,
 * queues, storage, durableObjects) with the custom `tracker` plugin and declares the endpoint table.
 * The Cloudflare default export below drives it via `app.server.handle` (HTTP/WS) and
 * `app.queues.consume` (the activity queue).
 *
 * @example
 * ```ts
 * const res = await app.server.handle(request, env, ctx);
 * ```
 */
export const app = createApp({
  config: { name: "tracker", stage: "production", compatibilityDate: "2026-06-17" },
  plugins: [kvPlugin, d1Plugin, queuesPlugin, storagePlugin, durableObjectsPlugin, trackerPlugin],
  pluginConfigs: {
    bindings: { required: ["DB", "BOARDS_KV", "ATTACHMENTS", "ACTIVITY_QUEUE", "BOARD"] },
    d1: { binding: "DB" },
    kv: { binding: "BOARDS_KV" },
    storage: { bucket: "ATTACHMENTS" },
    durableObjects: { bindings: { board: "BOARD" } },
    queues: {
      producers: ["ACTIVITY_QUEUE"],
      // Late-bound: the closure captures `app`; invoked only at queue-event time, after createApp returns (D8).
      // eslint-disable-next-line jsdoc/require-jsdoc -- structural queue consumer callback
      onMessage: async (message: Message, env: WorkerEnv) => {
        const body = message.body as ActivityMessage;
        await app.tracker.recordActivity(env, body.boardId, body.entry);
      }
    },
    tracker: {
      boardDo: "board",
      activityQueue: "ACTIVITY_QUEUE",
      boardIndexKey: "boards:index",
      attachmentPrefix: "attachments/"
    },
    server: {
      endpoints: [
        endpoint("/health").get(() => new Response("ok")),

        // Boards
        endpoint("/api/boards").get(async ctx =>
          Response.json(await ctx.require(trackerPlugin).listBoards(ctx.env))
        ),
        endpoint("/api/boards").post(async ctx => {
          const input = (await ctx.request.json()) as NewBoard;
          return Response.json(await ctx.require(trackerPlugin).createBoard(ctx.env, input), {
            status: 201
          });
        }),
        endpoint("/api/boards/{id}").get(async ctx => {
          const snapshot = await ctx.require(trackerPlugin).getBoard(ctx.env, ctx.params.id ?? "");
          if (!snapshot) return new Response("not found", { status: 404 });
          return Response.json(snapshot);
        }),
        endpoint("/api/boards/{id}/activity").get(async ctx =>
          Response.json(await ctx.require(trackerPlugin).listActivity(ctx.env, ctx.params.id ?? ""))
        ),

        // Columns
        endpoint("/api/boards/{id}/columns").post(async ctx => {
          const input = (await ctx.request.json()) as NewColumn;
          const column = await ctx
            .require(trackerPlugin)
            .createColumn(ctx.env, ctx.params.id ?? "", input);
          return Response.json(column, { status: 201 });
        }),

        // Cards
        endpoint("/api/boards/{id}/cards").post(async ctx => {
          const { columnId, ...input } = (await ctx.request.json()) as NewCard & {
            columnId: string;
          };
          const card = await ctx
            .require(trackerPlugin)
            .createCard(ctx.env, ctx.params.id ?? "", columnId, input);
          return Response.json(card, { status: 201 });
        }),
        endpoint("/api/boards/{id}/cards/{cid}").patch(async ctx => {
          const patch = (await ctx.request.json()) as CardPatch;
          const card = await ctx
            .require(trackerPlugin)
            .updateCard(ctx.env, ctx.params.id ?? "", ctx.params.cid ?? "", patch);
          return Response.json(card);
        }),
        endpoint("/api/boards/{id}/cards/{cid}").delete(async ctx => {
          await ctx
            .require(trackerPlugin)
            .deleteCard(ctx.env, ctx.params.id ?? "", ctx.params.cid ?? "");
          return Response.json({ ok: true });
        }),
        endpoint("/api/boards/{id}/cards/{cid}/move").post(async ctx => {
          const move = (await ctx.request.json()) as CardMove;
          const card = await ctx
            .require(trackerPlugin)
            .moveCard(ctx.env, ctx.params.id ?? "", ctx.params.cid ?? "", move);
          return Response.json(card);
        }),

        // Attachments (R2 blob + D1 metadata)
        endpoint("/api/boards/{id}/cards/{cid}/attachments").post(async ctx => {
          const filename = ctx.request.headers.get("x-filename") ?? DEFAULT_FILENAME;
          const contentType = ctx.request.headers.get("content-type") ?? DEFAULT_CONTENT_TYPE;
          const fileBody = await ctx.request.arrayBuffer();
          const attachment = await ctx
            .require(trackerPlugin)
            .addAttachment(ctx.env, ctx.params.id ?? "", ctx.params.cid ?? "", {
              filename,
              contentType,
              body: fileBody
            });
          return Response.json(attachment, { status: 201 });
        }),
        endpoint("/api/attachments/{id}").get(async ctx => {
          // R2 stores no content type (D8) — read it from D1, then stream the blob with that header.
          const meta = await ctx
            .require(d1Plugin)
            .first<{ key: string; content_type: string; filename: string }>(
              ctx.env,
              "SELECT key, content_type, filename FROM attachments WHERE id = ?",
              ctx.params.id ?? ""
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

        // Live channel: forward the upgrade to the per-board Durable Object.
        endpoint("/ws/board/{id}").get(ctx =>
          ctx
            .require(durableObjectsPlugin)
            .get(ctx.env, "board", ctx.params.id ?? "")
            .fetch(ctx.request)
        )
      ]
    }
  }
});

export { Board } from "./board"; // Cloudflare instantiates the DO class from the Worker module

export default {
  /**
   * Routes `/api/*` + `/ws/*` to the server; serves all other paths from Static Assets.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context (waitUntil / passThroughOnException).
   * @returns The route response, or the static-asset response.
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) {
      return app.server.handle(request, env, ctx);
    }
    return (env.ASSETS as Fetcher).fetch(request);
  },
  /**
   * Drains the activity queue through the app's queue consumer.
   *
   * @param batch - The delivered message batch.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context.
   * @returns Resolves when the batch has been processed.
   * @example
   * ```ts
   * export default { queue };
   * ```
   */
  queue(batch: MessageBatch, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    return app.queues.consume(batch, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
