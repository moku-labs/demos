/**
 * @file ICE provisioning — the constants + response-shape normalizer shared by the browser fetch
 * (`client.ts`) and the worker credential endpoint (`handler.ts`).
 *
 * Internet play (Phase 1): WebRTC's ICE negotiation already races local/STUN/relay candidate pairs in
 * parallel and picks the best — the app's only job is to PROVISION the relay rung (short-lived TURN
 * credentials minted by the worker) and FAIL OPEN when it can't (room's default public STUN keeps
 * today's LAN + most-internet behaviour). No app-side fallback state machine exists on purpose.
 */

/** Same-origin path of the worker's ICE-credential endpoint (client fetch + worker route). */
export const ICE_PATH = "/api/ice";

/** Browser-side budget for the credential fetch — past this, boot proceeds with the STUN default. */
export const ICE_FETCH_TIMEOUT_MS = 2000;

/** Minted TURN credential lifetime — comfortably longer than any party session. */
export const ICE_CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;

/**
 * Normalize an untrusted `iceServers` value (the worker's JSON body on the client; Cloudflare's TURN
 * API body on the worker — which returns a SINGLE `RTCIceServer`-shaped object, not an array) into a
 * clean `RTCIceServer[]`. Unknown shapes yield `undefined` so every caller fails open.
 *
 * @param value - The untrusted `iceServers` payload (object, array, or garbage).
 * @returns The validated servers, or `undefined` when nothing usable survives.
 * @example
 * ```ts
 * normalizeIceServers({ urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" });
 * // → [{ urls: [...], username: "u", credential: "c" }]
 * ```
 */
export function normalizeIceServers(value: unknown): readonly RTCIceServer[] | undefined {
  const candidates = Array.isArray(value) ? value : [value];
  const servers: RTCIceServer[] = [];

  for (const candidate of candidates) {
    const server = normalizeOne(candidate);
    if (server) servers.push(server);
  }

  return servers.length > 0 ? servers : undefined;
}

/**
 * Validate one candidate entry into an `RTCIceServer`, or reject it.
 *
 * @param candidate - One untrusted entry.
 * @returns The validated server, or `undefined` when the entry is unusable.
 * @example
 * ```ts
 * normalizeOne({ urls: "stun:stun.cloudflare.com:3478" }); // → { urls: "stun:..." }
 * ```
 */
function normalizeOne(candidate: unknown): RTCIceServer | undefined {
  if (typeof candidate !== "object" || candidate === null) return undefined;
  const record = candidate as Record<string, unknown>;

  // `urls` is the one mandatory field — a URL string or a non-empty array of URL strings.
  const validUrls = normalizeUrls(record["urls"]);
  if (!validUrls) return undefined;

  // TURN credentials ride along when present (STUN entries legitimately have neither).
  const username = typeof record["username"] === "string" ? record["username"] : undefined;
  const credential = typeof record["credential"] === "string" ? record["credential"] : undefined;
  return {
    urls: validUrls,
    ...(username === undefined ? {} : { username }),
    ...(credential === undefined ? {} : { credential })
  };
}

/**
 * Validate the `urls` field of one candidate: a URL string, or a non-empty all-string array.
 *
 * @param urls - The untrusted `urls` value.
 * @returns The validated urls, or `undefined` when malformed.
 * @example
 * ```ts
 * normalizeUrls(["stun:a", "turn:b"]); // → ["stun:a", "turn:b"]
 * ```
 */
function normalizeUrls(urls: unknown): string | string[] | undefined {
  if (typeof urls === "string") return urls;
  const isStringArray =
    Array.isArray(urls) && urls.length > 0 && urls.every(url => typeof url === "string");
  return isStringArray ? (urls as string[]) : undefined;
}
