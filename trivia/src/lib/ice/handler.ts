/**
 * @file ICE provisioning — the worker-side `GET /api/ice` handler. Mints short-lived TURN relay
 * credentials from Cloudflare's TURN service when the deployment carries the TURN secrets, rate-limited
 * per-IP through the existing RATE_LIMIT KV. Without secrets (local dev, un-provisioned stage) it answers
 * a quiet empty 200 and the client fails open onto its STUN default — the endpoint is an upgrade, never
 * a dependency. Pure + injectable (structural env, injectable fetch) so it unit-tests without a worker.
 */
import { ICE_CREDENTIAL_TTL_SECONDS, normalizeIceServers } from "./shared";

/** Cloudflare TURN credential API root (Realtime TURN service). */
const CF_TURN_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys";

/** Per-IP mint budget inside one rate window — a party mints a handful, a scraper hits the wall. */
const RATE_LIMIT_MAX = 30;

/** Rate window in seconds (KV's minimum TTL is 60 — align to it). */
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * The slice of a Cloudflare `KVNamespace` the rate limiter touches (structural, so unit tests pass a
 * plain in-memory map and the lib never imports worker types).
 */
export type IceRateLimitKv = {
  /** Read a counter cell. */
  get(key: string): Promise<string | null>;
  /** Write a counter cell with a TTL. */
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/**
 * The worker bindings the handler reads. Both TURN secrets are optional — a deployment without them
 * (every local dev run) serves 503 and the browser falls back to STUN.
 */
export type IceEnvironment = {
  /** Cloudflare TURN key id (`wrangler secret put TURN_KEY_ID`). */
  TURN_KEY_ID?: string;
  /** Cloudflare TURN key API token (`wrangler secret put TURN_KEY_API_TOKEN`). */
  TURN_KEY_API_TOKEN?: string;
  /** The app's rate-limit KV (same binding the signaling join path uses). */
  RATE_LIMIT?: IceRateLimitKv;
};

/**
 * Build a small JSON response with credential-appropriate caching (never store).
 *
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 * @returns The response.
 * @example
 * ```ts
 * json(503, { error: "ice-unavailable" });
 * ```
 */
function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Count this IP against the mint budget: read-increment a TTL'd KV cell, deny past the cap. The
 * read-then-write is not atomic — fine for abuse damping (the TTL on minted credentials is the real
 * bound), not billing-grade quota.
 *
 * @param kv - The rate-limit KV.
 * @param ip - The caller's IP (or the shared `"unknown"` bucket when the header is absent).
 * @returns `true` when the request is within budget.
 * @example
 * ```ts
 * if (!(await allowRequest(env.RATE_LIMIT, ip))) return json(429, { error: "rate-limited" });
 * ```
 */
async function allowRequest(kv: IceRateLimitKv, ip: string): Promise<boolean> {
  const key = `ice:${ip}`;
  const seen = Number((await kv.get(key)) ?? "0");
  if (seen >= RATE_LIMIT_MAX) return false;
  await kv.put(key, String(seen + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return true;
}

/**
 * Mint one short-lived credential set from Cloudflare's TURN API and normalize its body (Cloudflare
 * returns a single `RTCIceServer`-shaped object under `iceServers`).
 *
 * @param keyId - The TURN key id.
 * @param apiToken - The TURN key API token.
 * @param fetchImpl - Injectable fetch (tests).
 * @returns The validated servers, or `undefined` on any upstream failure.
 * @example
 * ```ts
 * const servers = await mintFromCloudflare(env.TURN_KEY_ID, env.TURN_KEY_API_TOKEN, fetch);
 * ```
 */
async function mintFromCloudflare(
  keyId: string,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<readonly RTCIceServer[] | undefined> {
  try {
    const response = await fetchImpl(`${CF_TURN_BASE}/${keyId}/credentials/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: ICE_CREDENTIAL_TTL_SECONDS })
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as { iceServers?: unknown } | null;
    return normalizeIceServers(body?.iceServers);
  } catch {
    return undefined;
  }
}

/**
 * Handle `GET /api/ice`: rate-limit, mint TURN credentials, answer `{ iceServers }`. No secrets is
 * NOT a failure — it answers a quiet, empty `200 {}` (every local dev boot; a non-2xx here would
 * paint a red console line on every TV + phone load for expected behaviour). Real failures keep
 * loud, distinct statuses the fail-open client treats identically (STUN fallback): 405 wrong method,
 * 429 over budget, 502 upstream mint failure.
 *
 * @param request - The incoming request (IP read from `CF-Connecting-IP`).
 * @param env - The worker bindings (TURN secrets + rate-limit KV, each optional).
 * @param fetchImpl - Injectable fetch (tests); defaults to the global.
 * @returns The JSON response.
 * @example
 * ```ts
 * if (url.pathname === ICE_PATH) return handleIce(request, env);
 * ```
 */
export async function handleIce(
  request: Request,
  env: IceEnvironment,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (request.method !== "GET") return json(405, { error: "method-not-allowed" });

  // No TURN secrets on this deployment → the rung simply isn't provisioned. Answer an empty 200
  // (expected state, not an error — a 5xx would console-spam every local dev boot); the client
  // normalizes the missing field to its STUN fallback.
  const keyId = env.TURN_KEY_ID;
  const apiToken = env.TURN_KEY_API_TOKEN;
  if (!keyId || !apiToken) return json(200, {});

  // Damp abuse per-IP before spending an upstream call (strangers farming relay credentials).
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.RATE_LIMIT && !(await allowRequest(env.RATE_LIMIT, ip))) {
    return json(429, { error: "rate-limited" });
  }

  const iceServers = await mintFromCloudflare(keyId, apiToken, fetchImpl);
  if (!iceServers) return json(502, { error: "mint-failed" });
  return json(200, { iceServers });
}
