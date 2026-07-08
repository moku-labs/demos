/**
 * @file Unit tests for the browser-side ICE credential fetch (`src/lib/ice/client.ts`) and the shared
 * response normalizer. The contract under test is FAIL-OPEN: every failure mode (non-200, network
 * throw, timeout abort, garbage body, empty list) must yield `undefined` so the room transport keeps
 * its public-STUN default — the relay rung is an upgrade, never a boot dependency.
 */
/* eslint-disable unicorn/no-null -- deliberately exercises `null` inputs: JSON bodies and array
   entries arrive as literal `null` off the wire, and the normalizer must reject exactly that. */
import { describe, expect, it } from "vitest";
import { fetchIceServers, forcedIcePolicy } from "../../src/lib/ice/client";
import { ICE_PATH, normalizeIceServers } from "../../src/lib/ice/shared";

/** A minimal fetch stub resolving with the given status/body. */
function fetchResolving(status: number, body: unknown): typeof fetch {
  return (() => Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch;
}

const TURN_SERVER = {
  urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
  username: "user",
  credential: "secret"
};

describe("fetchIceServers (fail-open browser fetch)", () => {
  it("returns the validated servers on a 200 with a well-formed body", async () => {
    const servers = await fetchIceServers(fetchResolving(200, { iceServers: [TURN_SERVER] }));
    expect(servers).toEqual([TURN_SERVER]);
  });

  it("requests the shared ICE_PATH with an abort signal (the 2s boot budget)", async () => {
    let seenUrl: unknown;
    let seenSignal: unknown;
    const spy = ((url: unknown, init?: RequestInit) => {
      seenUrl = url;
      seenSignal = init?.signal;
      return Promise.resolve(Response.json({ iceServers: [TURN_SERVER] }));
    }) as unknown as typeof fetch;

    await fetchIceServers(spy);
    expect(seenUrl).toBe(ICE_PATH);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("fails open (undefined) on every non-200 the worker answers with", async () => {
    for (const status of [429, 502, 503]) {
      expect(await fetchIceServers(fetchResolving(status, { error: "x" }))).toBeUndefined();
    }
  });

  it("fails open when the fetch itself rejects (endpoint down, timeout abort)", async () => {
    const rejecting = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    expect(await fetchIceServers(rejecting)).toBeUndefined();

    const aborting = (() =>
      Promise.reject(
        new DOMException("The operation timed out.", "TimeoutError")
      )) as unknown as typeof fetch;
    expect(await fetchIceServers(aborting)).toBeUndefined();
  });

  it("fails open on a 200 with a garbage body (SPA fallback HTML, wrong JSON shape, empty list)", async () => {
    const html = (() =>
      Promise.resolve(
        new Response("<!doctype html><html></html>", { status: 200 })
      )) as unknown as typeof fetch;
    expect(await fetchIceServers(html)).toBeUndefined();

    expect(await fetchIceServers(fetchResolving(200, { nope: true }))).toBeUndefined();
    expect(await fetchIceServers(fetchResolving(200, { iceServers: [] }))).toBeUndefined();
    expect(await fetchIceServers(fetchResolving(200, null))).toBeUndefined();
  });
});

describe("normalizeIceServers (untrusted shape normalizer)", () => {
  it("accepts an array of servers, keeping only usable entries", () => {
    const servers = normalizeIceServers([
      TURN_SERVER,
      { urls: "stun:stun.cloudflare.com:3478" },
      { username: "orphan-with-no-urls" },
      "garbage",
      null
    ]);
    expect(servers).toEqual([TURN_SERVER, { urls: "stun:stun.cloudflare.com:3478" }]);
  });

  it("wraps Cloudflare's single-object form (the TURN API returns ONE RTCIceServer-shaped object)", () => {
    expect(normalizeIceServers(TURN_SERVER)).toEqual([TURN_SERVER]);
  });

  it("drops entries with malformed urls (empty array, non-string members) and non-string credentials", () => {
    expect(normalizeIceServers({ urls: [] })).toBeUndefined();
    expect(normalizeIceServers({ urls: [42] })).toBeUndefined();
    // Non-string username/credential are stripped, the entry survives on its urls.
    expect(normalizeIceServers({ urls: "stun:s", username: 5, credential: {} })).toEqual([
      { urls: "stun:s" }
    ]);
  });

  it("yields undefined when nothing usable survives", () => {
    expect(normalizeIceServers(undefined)).toBeUndefined();
    expect(normalizeIceServers("nope")).toBeUndefined();
    expect(normalizeIceServers([])).toBeUndefined();
    expect(normalizeIceServers([null, "x", { urls: 7 }])).toBeUndefined();
  });
});

describe("forcedIcePolicy (?ice=relay diagnostic toggle)", () => {
  it("returns 'relay' only for ?ice=relay", () => {
    expect(forcedIcePolicy("?ice=relay")).toBe("relay");
    expect(forcedIcePolicy("?code=K7M2QX&ice=relay")).toBe("relay");
  });

  it("ignores every other value (default transport policy stays 'all')", () => {
    expect(forcedIcePolicy("")).toBeUndefined();
    expect(forcedIcePolicy("?ice=all")).toBeUndefined();
    expect(forcedIcePolicy("?ice=")).toBeUndefined();
    expect(forcedIcePolicy("?ice=RELAY")).toBeUndefined();
    expect(forcedIcePolicy("?relay=1")).toBeUndefined();
  });

  it("is DOM-safe: no explicit search + no location yields undefined (headless/tests)", () => {
    // Vitest's node environment has no `location`; the default-parameter path must not throw.
    expect(forcedIcePolicy()).toBeUndefined();
  });
});
