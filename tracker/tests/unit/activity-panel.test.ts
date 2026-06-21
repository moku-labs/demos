// @vitest-environment happy-dom
/**
 * @file Full unit tests for the activity-panel island via `@moku-labs/web/testing`.
 * lib/api (listActivity) and lib/realtime (the patch stream) are mocked as ports.
 */

import { mountIsland } from "@moku-labs/web/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityPanel } from "../../src/islands/activity-panel";
import type { Activity } from "../../src/lib/types";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((patch: unknown) => void) | undefined
}));

vi.mock("../../src/lib/realtime", () => ({
  onPatch: (handler: (patch: unknown) => void) => {
    realtime.handler = handler;
    return () => {
      realtime.handler = undefined;
    };
  }
}));

vi.mock("../../src/lib/api", () => ({ listActivity: vi.fn() }));

import * as api from "../../src/lib/api";

const activity = (id: string, summary: string, at: number): Activity => ({
  id,
  boardId: "b1",
  kind: "card.created",
  summary,
  at
});

beforeEach(() => {
  realtime.handler = undefined;
});
afterEach(() => {
  document.body.innerHTML = "";
  realtime.handler = undefined;
  vi.clearAllMocks();
});

describe("activity-panel island", () => {
  it("seeds the feed from listActivity", async () => {
    vi.mocked(api.listActivity).mockResolvedValue([activity("a1", "Created board", 1)]);
    const handle = mountIsland<{ activities: Activity[] }>(activityPanel, { params: { id: "b1" } });
    await handle.settle();

    expect(api.listActivity).toHaveBeenCalledWith("b1");
    expect(handle.el.querySelectorAll("[data-activity-entry]")).toHaveLength(1);
    expect(handle.el.querySelector("[data-activity-summary]")?.textContent).toBe("Created board");
  });

  it("prepends a live activity patch (newest first)", async () => {
    vi.mocked(api.listActivity).mockResolvedValue([activity("a1", "First", 1)]);
    const handle = mountIsland<{ activities: Activity[] }>(activityPanel, { params: { id: "b1" } });
    await handle.settle();

    realtime.handler?.({ type: "activity", activity: activity("a2", "Second", 2) });
    handle.flush();

    const summaries = [...handle.el.querySelectorAll("[data-activity-summary]")].map(
      n => n.textContent
    );
    expect(summaries).toEqual(["Second", "First"]);
    expect(handle.state?.activities).toHaveLength(2);
  });

  it("ignores non-activity patches", async () => {
    vi.mocked(api.listActivity).mockResolvedValue([activity("a1", "Only", 1)]);
    const handle = mountIsland<{ activities: Activity[] }>(activityPanel, { params: { id: "b1" } });
    await handle.settle();

    realtime.handler?.({ type: "card.deleted", cardId: "k1" });
    handle.flush();
    expect(handle.el.querySelectorAll("[data-activity-entry]")).toHaveLength(1);
  });

  it("renders an empty feed when there is no activity", async () => {
    vi.mocked(api.listActivity).mockResolvedValue([]);
    const handle = mountIsland<{ activities: Activity[] }>(activityPanel, { params: { id: "b1" } });
    await handle.settle();
    expect(handle.el.querySelectorAll("[data-activity-entry]")).toHaveLength(0);
  });

  it("unsubscribes from the patch stream on unmount", async () => {
    vi.mocked(api.listActivity).mockResolvedValue([]);
    const handle = mountIsland<{ activities: Activity[] }>(activityPanel, { params: { id: "b1" } });
    await handle.settle();
    expect(realtime.handler).toBeTypeOf("function");
    handle.unmount();
    expect(realtime.handler).toBeUndefined();
  });
});
