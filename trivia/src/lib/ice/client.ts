/**
 * @file ICE provisioning — the browser-side credential fetch. Strictly fail-open: ANY failure
 * (endpoint down, no secrets configured, timeout, garbage body) yields `undefined`, and the room
 * transport keeps its default public-STUN config — exactly today's behaviour. Boot never blocks on
 * this beyond {@link ICE_FETCH_TIMEOUT_MS}.
 */
import { ICE_FETCH_TIMEOUT_MS, ICE_PATH, normalizeIceServers } from "./shared";

/**
 * Read the `?ice=relay` diagnostic toggle from the page URL — a deterministic force-relay test mode:
 * with `"relay"`, the `RTCPeerConnection` forms TURN-only candidate pairs, so a successful pairing
 * PROVES the relay rung works end-to-end (and fails by design when `/api/ice` minted nothing, since
 * STUN/host candidates are excluded). A diagnostic, not a user-facing feature: it only ever degrades
 * the session that opts in, so it needs no build gating. Any other `ice` value is ignored.
 *
 * @param search - Injectable query string (tests); defaults to the page's `location.search`.
 * @returns `"relay"` when the toggle is set; `undefined` otherwise (transport default `"all"`).
 * @example
 * ```ts
 * const app = createStageApp(emit, undefined, () => fetchIceServers(), forcedIcePolicy());
 * ```
 */
export function forcedIcePolicy(search?: string): RTCIceTransportPolicy | undefined {
  const query = search ?? (typeof location === "undefined" ? "" : location.search);
  const value = new URLSearchParams(query).get("ice");
  return value === "relay" ? "relay" : undefined;
}

/**
 * Fetch short-lived ICE servers (STUN + TURN relay) from the same-origin worker endpoint. Handed to
 * room as its lazy `iceServers` provider (via the bridge's `iceProvider` wrapper), so it runs in
 * parallel with the signaling join and off the boot critical path.
 *
 * @param fetchImpl - Injectable fetch (tests); defaults to the global.
 * @returns The validated servers, or `undefined` to fail open onto the transport's STUN default.
 * @example
 * ```ts
 * const app = createStageApp(emit, undefined, () => fetchIceServers(), forcedIcePolicy());
 * ```
 */
export async function fetchIceServers(
  fetchImpl: typeof fetch = fetch
): Promise<readonly RTCIceServer[] | undefined> {
  try {
    const response = await fetchImpl(ICE_PATH, {
      signal: AbortSignal.timeout(ICE_FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as { iceServers?: unknown } | null;
    return normalizeIceServers(body?.iceServers);
  } catch {
    // Fail open — the relay rung is an upgrade, never a boot dependency.
    return undefined;
  }
}
