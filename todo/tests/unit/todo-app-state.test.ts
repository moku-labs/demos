import { afterEach, describe, expect, it, vi } from "vitest";
import { initState } from "../../src/islands/todo-app/state";

/** Stand in for `matchMedia`, answering every query the same way. */
function stubViewport(wide: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: wide, media: query }));
  vi.stubGlobal("matchMedia", matchMedia);

  return matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initState", () => {
  it("starts the System panel collapsed on a phone-sized viewport", () => {
    const matchMedia = stubViewport(false);

    expect(initState().panelOpen).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 640px)");
  });

  it("starts the System panel open on a wider viewport", () => {
    stubViewport(true);

    expect(initState().panelOpen).toBe(true);
  });

  it("keeps the panel open where there is no viewport to ask", () => {
    expect(initState().panelOpen).toBe(true);
  });

  it("starts with the list not loaded and nothing failed", () => {
    expect(initState()).toMatchObject({ todos: [], ready: false, loadFailed: false });
  });
});
