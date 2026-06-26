/**
 * Unit tests for the language plugin.
 *
 * Tests are organised by module:
 * - `state.ts`       — `createLanguageState`
 * - `api.ts`         — pure functions: `tallyVotes`, `buildOptions`, `recordVote`
 * - `vote-timer.ts`  — module-closure timer: `armVoteTimer`, `clearVoteTimer`, `stashConfirm`, `takeConfirm`
 * - `lifecycle.ts`   — `stopLanguage` (onStop hook)
 * - `handlers.ts`    — `initLanguagePlugin`, `createLanguageApi` (with mock deps)
 * - `types.ts`       — structural type checks via `expectTypeOf`
 */
import type { JsonValue } from "@moku-labs/room";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { buildOptions, recordVote, tallyVotes } from "../../api";
import type { IntentDeps, SyncDeps } from "../../handlers";
import { createLanguageApi, initLanguagePlugin } from "../../handlers";
import { stopLanguage } from "../../lifecycle";
import { createLanguageState } from "../../state";
import type { Api, Config, State, VoteOption } from "../../types";
import { armVoteTimer, clearVoteTimer, stashConfirm, takeConfirm } from "../../vote-timer";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const CONFIG: Config = {
  languages: ["en", "ru"],
  voteWindowMs: 5000,
  defaultLang: "en"
};

// ─── minimal dep mocks for handlers ─────────────────────────────────────────

/** A read-only JSON cell map (mirrors room's slice `Cells`). */
type Cells = Readonly<Record<string, JsonValue>>;

type SyncMock = SyncDeps & { slices: Record<string, Record<string, unknown>> };

type IntentMock = IntentDeps & {
  schemas: Record<string, unknown>;
  handlers: Record<string, (payload: unknown, meta: { peerId: string; cSeq: number }) => void>;
  trigger: (name: string, payload: unknown, peerId: string, cSeq?: number) => void;
};

type StageMock = {
  mutate: Mock<(ns: string, recipe: (draft: Cells) => Cells) => void>;
  slices: Record<string, Record<string, unknown>>;
};

const makeSyncMock = (): SyncMock => {
  const slices: Record<string, Record<string, unknown>> = {};
  return {
    registerSlice: vi.fn((ns: string, initial: Cells) => {
      slices[ns] = { ...initial };
    }),
    slices
  };
};

const makeIntentMock = (): IntentMock => {
  const schemas: Record<string, unknown> = {};
  const handlers: Record<
    string,
    (payload: unknown, meta: { peerId: string; cSeq: number }) => void
  > = {};
  return {
    register: vi.fn((name: string, schema: unknown) => {
      schemas[name] = schema;
    }),
    onIntent: vi.fn(
      (
        name: string,
        handler: (payload: unknown, meta: { peerId: string; cSeq: number }) => void
      ) => {
        handlers[name] = handler;
        return () => {
          delete handlers[name];
        };
      }
    ),
    schemas,
    handlers,
    trigger: (name, payload, peerId, cSeq = 1) => {
      handlers[name]?.(payload, { peerId, cSeq });
    }
  };
};

const makeStageMock = (): StageMock => {
  const slices: Record<string, Record<string, unknown>> = {};
  return {
    mutate: vi.fn((ns: string, recipe: (draft: Cells) => Cells) => {
      slices[ns] = recipe({ ...slices[ns] } as Cells) as Record<string, unknown>;
    }),
    slices
  };
};

// ---------------------------------------------------------------------------
// createLanguageState
// ---------------------------------------------------------------------------

describe("createLanguageState", () => {
  it("returns an empty Map", () => {
    const state = createLanguageState();
    expect(state).toBeInstanceOf(Map);
    expect(state.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// api.ts — pure domain functions
// ---------------------------------------------------------------------------

describe("tallyVotes (pure)", () => {
  it("returns defaultLang when state is empty", () => {
    const state: State = new Map();
    expect(tallyVotes(state, CONFIG.languages, CONFIG.defaultLang)).toBe("en");
  });

  it("returns the majority language", () => {
    const state: State = new Map([
      ["p1", "ru"],
      ["p2", "ru"],
      ["p3", "en"]
    ]);
    expect(tallyVotes(state, CONFIG.languages, CONFIG.defaultLang)).toBe("ru");
  });

  it("returns defaultLang on a tie", () => {
    const state: State = new Map([
      ["p1", "en"],
      ["p2", "ru"]
    ]);
    expect(tallyVotes(state, CONFIG.languages, CONFIG.defaultLang)).toBe("en");
  });

  it("respects language ordering (earlier language wins tie when counts equal)", () => {
    const state: State = new Map([
      ["p1", "en"],
      ["p2", "ru"]
    ]);
    // "en" appears first in the languages array — on a tie, defaultLang (first in iteration) wins
    expect(tallyVotes(state, ["en", "ru"], "en")).toBe("en");
  });

  it("single vote wins", () => {
    const state: State = new Map([["p1", "ru"]]);
    expect(tallyVotes(state, CONFIG.languages, CONFIG.defaultLang)).toBe("ru");
  });
});

describe("buildOptions (pure)", () => {
  it("returns one entry per language with empty voters when state is empty", () => {
    const opts = buildOptions(new Map(), CONFIG.languages);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toEqual({ lang: "en", voters: [] });
    expect(opts[1]).toEqual({ lang: "ru", voters: [] });
  });

  it("groups voters correctly", () => {
    const state: State = new Map([
      ["p1", "ru"],
      ["p2", "ru"],
      ["p3", "en"]
    ]);
    const opts = buildOptions(state, CONFIG.languages);
    const en = opts.find(o => o.lang === "en");
    const ru = opts.find(o => o.lang === "ru");
    expect(en?.voters).toEqual(["p3"]);
    expect(ru?.voters).toContain("p1");
    expect(ru?.voters).toContain("p2");
  });
});

describe("recordVote (pure)", () => {
  it("records the vote in state (mutates in place)", () => {
    const state: State = new Map();
    recordVote(state, "p1", "ru", CONFIG.languages, CONFIG.defaultLang);
    expect(state.get("p1")).toBe("ru");
  });

  it("returns updated options and leading", () => {
    const state: State = new Map();
    const { options, leading } = recordVote(
      state,
      "p1",
      "ru",
      CONFIG.languages,
      CONFIG.defaultLang
    );
    expect(leading).toBe("ru");
    const ru = options.find(o => o.lang === "ru");
    expect(ru?.voters).toContain("p1");
  });

  it("last-write-wins: a second call for the same peer overwrites the first", () => {
    const state: State = new Map();
    recordVote(state, "p1", "ru", CONFIG.languages, CONFIG.defaultLang);
    recordVote(state, "p1", "en", CONFIG.languages, CONFIG.defaultLang);
    expect(state.get("p1")).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// vote-timer.ts — module-closure singleton
// ---------------------------------------------------------------------------

describe("vote-timer (module closure)", () => {
  afterEach(() => {
    clearVoteTimer();
    vi.useRealTimers();
  });

  it("armVoteTimer fires after the given delay", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    armVoteTimer(1000, cb);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("clearVoteTimer prevents the callback from firing", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    armVoteTimer(1000, cb);
    clearVoteTimer();
    vi.runAllTimers();
    expect(cb).not.toHaveBeenCalled();
  });

  it("clearVoteTimer is idempotent (safe when no timer is set)", () => {
    expect(() => clearVoteTimer()).not.toThrow();
    expect(() => clearVoteTimer()).not.toThrow();
  });

  it("stashConfirm + takeConfirm round-trips the callback", () => {
    const cb = vi.fn();
    stashConfirm(cb);
    const retrieved = takeConfirm();
    expect(retrieved).toBe(cb);
  });

  it("takeConfirm clears the stash (returns undefined on second call)", () => {
    stashConfirm(vi.fn());
    takeConfirm(); // consume
    expect(takeConfirm()).toBeUndefined();
  });

  it("takeConfirm returns undefined when nothing was stashed", () => {
    expect(takeConfirm()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// lifecycle.ts — stopLanguage (onStop)
// ---------------------------------------------------------------------------

describe("stopLanguage (onStop)", () => {
  afterEach(() => {
    clearVoteTimer();
    vi.useRealTimers();
  });

  it("clears the pending vote timer so the callback never fires", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    armVoteTimer(5000, cb);
    stopLanguage();
    vi.runAllTimers();
    expect(cb).not.toHaveBeenCalled();
  });

  it("is idempotent when no timer is pending", () => {
    expect(() => stopLanguage()).not.toThrow();
    expect(() => stopLanguage()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handlers.ts — initLanguagePlugin
// ---------------------------------------------------------------------------

describe("initLanguagePlugin", () => {
  it("registers the languageVote slice with the correct initial shape", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();
    const state: State = new Map();

    initLanguagePlugin(sync, intent, stage, CONFIG, state, () => false);

    expect(sync.registerSlice).toHaveBeenCalledWith("languageVote", {
      open: false,
      options: [],
      // eslint-disable-next-line unicorn/no-null -- asserts the JSON slice-cell shape (null, not undefined)
      deadlineTs: null,
      leading: CONFIG.defaultLang,
      // eslint-disable-next-line unicorn/no-null -- asserts the JSON slice-cell shape (null, not undefined)
      confirmed: null
    });
  });

  it("registers the language-vote intent schema with enum fields", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();

    initLanguagePlugin(sync, intent, stage, CONFIG, new Map(), () => false);

    expect(intent.register).toHaveBeenCalledWith(
      "language-vote",
      expect.objectContaining({
        fields: expect.objectContaining({
          lang: expect.objectContaining({ type: "enum", values: CONFIG.languages })
        }),
        additionalFields: false
      })
    );
  });

  it("subscribes the intent handler via onIntent", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();

    initLanguagePlugin(sync, intent, stage, CONFIG, new Map(), () => false);

    expect(intent.onIntent).toHaveBeenCalledWith("language-vote", expect.any(Function));
  });

  it("intent handler does nothing when vote is closed (getOpen returns false)", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();
    const state: State = new Map();

    initLanguagePlugin(sync, intent, stage, CONFIG, state, () => false);
    intent.trigger("language-vote", { lang: "ru" }, "p1");

    expect(state.size).toBe(0);
    expect(stage.mutate).not.toHaveBeenCalled();
  });

  it("intent handler records the peer's vote when vote is open", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();
    const state: State = new Map();

    let open = false;
    initLanguagePlugin(sync, intent, stage, CONFIG, state, () => open);

    open = true;
    intent.trigger("language-vote", { lang: "ru" }, "p1");

    expect(state.get("p1")).toBe("ru");
  });

  it("intent handler calls stage.mutate to re-publish the tally when vote is open", () => {
    const sync = makeSyncMock();
    const intent = makeIntentMock();
    const stage = makeStageMock();
    const state: State = new Map();

    let open = false;
    initLanguagePlugin(sync, intent, stage, CONFIG, state, () => open);

    open = true;
    intent.trigger("language-vote", { lang: "ru" }, "p1");

    expect(stage.mutate).toHaveBeenCalled();
  });

  it("does not arm any timer during init", () => {
    vi.useFakeTimers();
    try {
      const sync = makeSyncMock();
      const intent = makeIntentMock();
      const stage = makeStageMock();

      initLanguagePlugin(sync, intent, stage, CONFIG, new Map(), () => false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// handlers.ts — createLanguageApi
// ---------------------------------------------------------------------------

describe("createLanguageApi", () => {
  let stage: StageMock;
  let state: State;
  let voteOpen: boolean;
  let api: Api;

  beforeEach(() => {
    vi.useFakeTimers();
    stage = makeStageMock();
    state = new Map();
    voteOpen = false;
    api = createLanguageApi(
      stage,
      CONFIG,
      state,
      () => voteOpen,
      v => {
        voteOpen = v;
      }
    );
  });

  afterEach(() => {
    clearVoteTimer();
    vi.useRealTimers();
  });

  describe("openVote", () => {
    it("sets the open gate to true", () => {
      api.openVote(vi.fn());
      expect(voteOpen).toBe(true);
    });

    it("calls stage.mutate to publish the open slice", () => {
      api.openVote(vi.fn());
      expect(stage.mutate).toHaveBeenCalledWith("languageVote", expect.any(Function));
    });

    it("sets deadlineTs to roughly now + voteWindowMs", () => {
      const now = Date.now();
      api.openVote(vi.fn());
      const lastCall = stage.mutate.mock.calls.at(-1);
      const recipe = lastCall?.[1] as (d: Record<string, unknown>) => Record<string, unknown>;
      const slice = recipe({});
      const deadline = slice["deadlineTs"] as number;
      expect(deadline).toBeGreaterThanOrEqual(now + CONFIG.voteWindowMs - 50);
      expect(deadline).toBeLessThanOrEqual(now + CONFIG.voteWindowMs + 50);
    });

    it("arms a setTimeout for voteWindowMs", () => {
      api.openVote(vi.fn());
      expect(vi.getTimerCount()).toBe(1);
    });

    it("is idempotent — second call when already open is a no-op", () => {
      api.openVote(vi.fn());
      const calls = stage.mutate.mock.calls.length;
      api.openVote(vi.fn());
      expect(stage.mutate.mock.calls.length).toBe(calls);
      expect(vi.getTimerCount()).toBe(1);
    });

    it("fires onConfirm exactly once when the timer expires", () => {
      const onConfirm = vi.fn();
      api.openVote(onConfirm);
      vi.runAllTimers();
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("confirms defaultLang on zero votes", () => {
      const onConfirm = vi.fn();
      api.openVote(onConfirm);
      vi.runAllTimers();
      expect(onConfirm).toHaveBeenCalledWith("en");
    });

    it("confirms the majority language", () => {
      state.set("p1", "ru");
      state.set("p2", "ru");
      state.set("p3", "en");
      const onConfirm = vi.fn();
      api.openVote(onConfirm);
      vi.runAllTimers();
      expect(onConfirm).toHaveBeenCalledWith("ru");
    });

    it("confirms defaultLang on a tie", () => {
      state.set("p1", "en");
      state.set("p2", "ru");
      const onConfirm = vi.fn();
      api.openVote(onConfirm);
      vi.runAllTimers();
      expect(onConfirm).toHaveBeenCalledWith("en");
    });

    it("sets open: false and confirmed on the slice when timer fires", () => {
      api.openVote(vi.fn());
      vi.runAllTimers();
      const calls = stage.mutate.mock.calls;
      const lastRecipe = calls.at(-1)?.[1] as (
        d: Record<string, unknown>
      ) => Record<string, unknown>;
      const slice = lastRecipe({
        open: true,
        options: [],
        leading: "en",
        deadlineTs: 0,
        // eslint-disable-next-line unicorn/no-null -- slice-cell fixture shape (null, not undefined)
        confirmed: null
      });
      expect(slice["open"]).toBe(false);
      expect(slice["confirmed"]).toBe("en");
    });
  });

  describe("cancelVote", () => {
    it("prevents onConfirm from firing", () => {
      const onConfirm = vi.fn();
      api.openVote(onConfirm);
      api.cancelVote();
      vi.runAllTimers();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("sets open gate to false", () => {
      api.openVote(vi.fn());
      api.cancelVote();
      expect(voteOpen).toBe(false);
    });

    it("publishes a mutate with open: false", () => {
      api.openVote(vi.fn());
      const callsBefore = stage.mutate.mock.calls.length;
      api.cancelVote();
      expect(stage.mutate.mock.calls.length).toBeGreaterThan(callsBefore);
      const lastRecipe = stage.mutate.mock.calls.at(-1)?.[1] as (
        d: Record<string, unknown>
      ) => Record<string, unknown>;
      const slice = lastRecipe({
        open: true,
        options: [],
        leading: "en",
        deadlineTs: 0,
        // eslint-disable-next-line unicorn/no-null -- slice-cell fixture shape (null, not undefined)
        confirmed: null
      });
      expect(slice["open"]).toBe(false);
    });

    it("is a no-op when the vote is not open", () => {
      expect(() => api.cancelVote()).not.toThrow();
      expect(stage.mutate).not.toHaveBeenCalled();
    });
  });

  describe("result", () => {
    it("returns null before any vote is opened", () => {
      expect(api.result()).toBeNull();
    });

    it("returns null while the vote is open", () => {
      api.openVote(vi.fn());
      expect(api.result()).toBeNull();
    });

    it("returns the confirmed lang after the timer fires", () => {
      api.openVote(vi.fn());
      vi.runAllTimers();
      expect(api.result()).toBe("en");
    });

    it("returns ru when ru wins", () => {
      state.set("p1", "ru");
      api.openVote(vi.fn());
      vi.runAllTimers();
      expect(api.result()).toBe("ru");
    });
  });
});

// ---------------------------------------------------------------------------
// Type-level checks
// ---------------------------------------------------------------------------

describe("types", () => {
  it("Api has openVote, cancelVote, result", () => {
    const stage = makeStageMock();
    const api = createLanguageApi(
      stage,
      CONFIG,
      new Map(),
      () => false,
      () => {}
    );
    expectTypeOf(api.openVote).toBeFunction();
    expectTypeOf(api.cancelVote).toBeFunction();
    expectTypeOf(api.result).toBeFunction();
  });

  it("result() returns Lang | null", () => {
    const stage = makeStageMock();
    const api = createLanguageApi(
      stage,
      CONFIG,
      new Map(),
      () => false,
      () => {}
    );
    expectTypeOf(api.result()).toEqualTypeOf<"en" | "ru" | null>();
  });

  it("VoteOption has lang and voters fields", () => {
    const option: VoteOption = { lang: "en", voters: ["p1"] };
    expectTypeOf(option.lang).toEqualTypeOf<"en" | "ru">();
    expectTypeOf(option.voters).toEqualTypeOf<string[]>();
  });

  it("State is a Map of PeerId to Lang", () => {
    const state: State = new Map([["p1", "en"]]);
    expectTypeOf(state).toEqualTypeOf<Map<string, "en" | "ru">>();
  });
});
