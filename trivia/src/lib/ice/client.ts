/**
 * @file ICE provisioning — the browser-side credential fetch. Strictly fail-open: ANY failure
 * (endpoint down, no secrets configured, timeout, garbage body) yields `undefined`, and the room
 * transport keeps its default public-STUN config — exactly today's behaviour. Boot never blocks on
 * this beyond {@link ICE_FETCH_TIMEOUT_MS}.
 */
import { ICE_FETCH_TIMEOUT_MS, ICE_PATH, normalizeIceServers } from "./shared";

/**
 * Fetch short-lived ICE servers (STUN + TURN relay) from the same-origin worker endpoint.
 *
 * @param fetchImpl - Injectable fetch (tests); defaults to the global.
 * @returns The validated servers, or `undefined` to fail open onto the transport's STUN default.
 * @example
 * ```ts
 * const iceServers = await fetchIceServers();
 * const app = createStageApp(emit, undefined, iceServers);
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
