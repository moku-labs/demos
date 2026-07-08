/**
 * @file build-info unit tests — `fetchBuildInfo` validation around a stubbed global `fetch`: a valid
 * payload passes through (with subject/date defaulting), and every failure mode (HTTP error, absent or
 * malformed body, network throw) resolves `null` so the lobby simply omits the badge.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBuildInfo } from "../../src/lib/build-info";

/** Stub global `fetch` to resolve an OK response with the given JSON body. */
function stubJson(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBuildInfo", () => {
  it("returns the build identity from a full payload", async () => {
    stubJson({ commit: "abc1234", subject: "fix: a thing", date: "2026-07-08" });
    expect(await fetchBuildInfo()).toEqual({
      commit: "abc1234",
      subject: "fix: a thing",
      date: "2026-07-08"
    });
  });

  it("defaults a missing subject/date to empty strings", async () => {
    stubJson({ commit: "abc1234" });
    expect(await fetchBuildInfo()).toEqual({ commit: "abc1234", subject: "", date: "" });
  });

  it("resolves null on a non-OK response (older build without the emit)", async () => {
    stubJson({ commit: "abc1234" }, false);
    expect(await fetchBuildInfo()).toBeNull();
  });

  it("resolves null on a null body", async () => {
    // eslint-disable-next-line unicorn/no-null -- the failure body under test IS null
    stubJson(null);
    expect(await fetchBuildInfo()).toBeNull();
  });

  it("resolves null when commit is missing or not a string", async () => {
    stubJson({ subject: "no commit" });
    expect(await fetchBuildInfo()).toBeNull();
    stubJson({ commit: 42 });
    expect(await fetchBuildInfo()).toBeNull();
  });

  it("resolves null on an empty commit", async () => {
    stubJson({ commit: "" });
    expect(await fetchBuildInfo()).toBeNull();
  });

  it("resolves null when fetch rejects (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    expect(await fetchBuildInfo()).toBeNull();
  });
});
