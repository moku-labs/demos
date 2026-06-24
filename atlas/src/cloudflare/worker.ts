/**
 * @file Cloudflare entry — the thin adapter connecting the Worker runtime to the Moku `server` app.
 *
 * Routes `/health` + `/api/*` + `/ws/*` to the server router (auth is enforced inside the endpoint
 * table — protected routes are built with `authed` = `endpoint.new(authGuard)` — so there is no
 * prefix-guard here), gates logged-out document navigations to protected app routes via a server-side
 * redirect, serves everything else from Static Assets (`env.ASSETS`), and drains the activity queue
 * through `server.queues.consume`. All app logic lives in `../server` and its plugins, never here.
 */
import type { WorkerEnv } from "@moku-labs/worker";
import { server } from "../server";

export { BoardChannel } from "./board-channel"; // Cloudflare instantiates the DO from the Worker module

/** App routes that require a session: the home board (`/`) and every `/board/*` deep link. */
const PROTECTED_ROUTE = /^\/(?:board\/|$)/;

/**
 * Whether `request` is a top-level *document* navigation to a protected app route — the case where a
 * logged-out visitor must be bounced to the sign-in gate by the SERVER. The SPA swaps only its content
 * region and cannot turn the app chrome into the auth split on the client, so the gate has to be a real
 * navigation; doing it here means a logged-out landing/reload never renders app chrome or 401-storms the
 * board islands. Excludes the auth pages + static assets (not protected) and the SPA's same-document
 * fetches (`Sec-Fetch-Dest` ≠ `document`); clients without the header fall back to `Accept: text/html`.
 *
 * @param request - The incoming request.
 * @param pathname - The request URL pathname.
 * @returns `true` when a logged-out visitor on this request should be redirected to `/signin/`.
 * @example
 * ```ts
 * if (isProtectedDocument(request, url.pathname) && !authed) return Response.redirect(signinUrl, 302);
 * ```
 */
function isProtectedDocument(request: Request, pathname: string): boolean {
  if (!PROTECTED_ROUTE.test(pathname)) return false;
  const destination = request.headers.get("Sec-Fetch-Dest");
  if (destination) return destination === "document";
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

export default {
  /**
   * Routes `/health` + `/api/*` + `/ws/*` to the server (auth enforced in the endpoint table), gates
   * logged-out app-route documents to the sign-in page, else serves static assets.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context.
   * @returns The route or static-asset response.
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // The server surface (health probe + API + WebSocket). Auth lives in the endpoint table now:
    // protected routes are built with `authed` (= endpoint.new(authGuard)), so no prefix-guard here.
    if (
      url.pathname === "/health" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/ws/")
    ) {
      return server.server.handle(request, env, ctx);
    }
    if (isProtectedDocument(request, url.pathname) && !(await server.auth.isAuthed(request, env))) {
      return Response.redirect(new URL("/signin/", url).toString(), 302);
    }
    return (env.ASSETS as Fetcher).fetch(request);
  },
  /**
   * Drains the activity queue through the app's queue consumer.
   *
   * @param batch - The delivered message batch.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context.
   * @returns Resolves when the batch is processed.
   * @example
   * ```ts
   * export default { queue };
   * ```
   */
  queue(batch: MessageBatch, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    return server.queues.consume(batch, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
