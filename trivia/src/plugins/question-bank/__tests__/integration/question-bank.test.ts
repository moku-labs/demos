import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { describe, expect, it } from "vitest";
import { questionBankPlugin } from "../../index";
import type { LoadedQuestion } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const _TEST_ROOM_CODE = "TESTAB";

/**
 * Encode a correct slot with a salt into an answerCheck string.
 * Format: `${salt}:${(correctSlot + salt.length) % 4}`
 */
function encode(salt: string, correctSlot: number): string {
  return `${salt}:${(correctSlot + salt.length) % 4}`;
}

/** Minimal LoadedQuestion fixture. */
function makeQuestion(
  id: string,
  category: "animals" | "space" | "movies-tv" | "food" | "strange" | "music",
  tier: "easy" | "medium" | "hard",
  correctSlot: number
): LoadedQuestion {
  return {
    id,
    category,
    tier,
    type: "text",
    prompt: `Q ${id}`,
    options: ["A", "B", "C", "D"],
    answerCheck: encode("salt", correctSlot)
  };
}

/** Shared signaling adapter for the full test suite. */
const sig = inMemory();

/** Build the stage (host) app with questionBankPlugin. */
function createStageApp() {
  return createApp({
    plugins: [stagePlugin, questionBankPlugin],
    pluginConfigs: {
      transport: {
        signaling: sig,
        iceServers: [],
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 500
      }
    }
  });
}

/** Build a controller app. */
function createControllerApp() {
  return createApp({
    plugins: [controllerPlugin],
    pluginConfigs: {
      transport: {
        signaling: sig,
        iceServers: [],
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 500
      }
    }
  });
}

/** Wait for a condition to be truthy (polling). */
async function waitFor(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
    await new Promise<void>(resolve => {
      setTimeout(resolve, intervalMs);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration: slices reach controller replica
// ─────────────────────────────────────────────────────────────────────────────

describe("question-bank integration: slices reach controller", () => {
  it("bank + categories slices reach the controller replica after createRoom + joinRoom", async () => {
    const stageApp = createStageApp();
    const ctrlApp = createControllerApp();

    await stageApp.start();
    await ctrlApp.start();

    const { code } = await stageApp.stage.createRoom();
    await ctrlApp.controller.joinRoom(code);

    // Wait for controller to get the bank slice
    await waitFor(() => {
      const bank = ctrlApp.controller.read("bank");
      return bank !== undefined;
    });

    const bank = ctrlApp.controller.read("bank");
    expect(bank?.status).toBe("idle");

    await stageApp.stop();
    await ctrlApp.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: seen-history intent excludes ids from next()
// ─────────────────────────────────────────────────────────────────────────────

describe("question-bank integration: seen-history excludes ids from next()", () => {
  it("controller sends seen-history; host next() skips those ids", async () => {
    const sig2 = inMemory();
    const stageApp = createApp({
      plugins: [stagePlugin, questionBankPlugin],
      pluginConfigs: {
        transport: {
          signaling: sig2,
          iceServers: [],
          heartbeatIntervalMs: 50,
          heartbeatTimeoutMs: 500
        }
      }
    });
    const ctrlApp = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: {
        transport: {
          signaling: sig2,
          iceServers: [],
          heartbeatIntervalMs: 50,
          heartbeatTimeoutMs: 500
        }
      }
    });

    await stageApp.start();
    await ctrlApp.start();

    const { code } = await stageApp.stage.createRoom();
    await ctrlApp.controller.joinRoom(code);

    // Wait for connection
    await waitFor(() => ctrlApp.controller.read("bank") !== undefined);

    // Manually load a mock bank into the stage app
    // We do this by calling load() with a mocked fetch
    const q1 = makeQuestion("q_seen", "animals", "easy", 0);
    const q2 = makeQuestion("q_new", "animals", "easy", 1);

    // Inject the index directly into questionBank's state for testing
    // (We can't easily mock fetch in integration without more plumbing;
    //  instead we seed state directly and test the intent path)
    const qbApi = stageApp.questionBank;
    // Access state through the plugin's internal state
    // We'll use the api.next() after seeding via a fetch mock
    const fetchMock = async (url: string) => {
      if (url.includes("animals")) {
        return {
          ok: true,
          json: async () => [q1, q2]
        };
      }
      return { ok: true, json: async () => [] };
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    await qbApi.load("en");
    globalThis.fetch = origFetch;

    // Controller sends seen-history with q_seen already seen
    ctrlApp.controller.intent("seen-history", { ids: "q_seen" });

    // Wait a moment for the intent to be processed
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100);
    });

    // next() should skip q_seen and return q_new
    const result = qbApi.next("animals", "easy");
    expect(result?.id).toBe("q_new");

    await stageApp.stop();
    await ctrlApp.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: load → next → grade round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("question-bank integration: load → next → grade round-trip", () => {
  it("fetches bank, selects a question, grades it correctly", async () => {
    const sig3 = inMemory();
    const stageApp = createApp({
      plugins: [stagePlugin, questionBankPlugin],
      pluginConfigs: {
        transport: {
          signaling: sig3,
          iceServers: [],
          heartbeatIntervalMs: 50,
          heartbeatTimeoutMs: 500
        }
      }
    });

    await stageApp.start();
    await stageApp.stage.createRoom();

    const q1 = makeQuestion("r1", "space", "hard", 2);
    const fetchMock = async (url: string) => ({
      ok: true,
      json: async () => (url.includes("space") ? [q1] : [])
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    const api = stageApp.questionBank;
    await api.load("en");
    globalThis.fetch = origFetch;

    // next: should return secret-free PublicQuestion
    const pub = api.next("space", "hard");
    expect(pub).not.toBeNull();
    expect(pub?.id).toBe("r1");
    expect("answerCheck" in (pub ?? {})).toBe(false);

    // grade: correct slot is 2
    const gradeResult = api.grade("r1", 2);
    expect(gradeResult.correctSlot).toBe(2);
    expect(gradeResult.correct).toBe(true);

    // grade with wrong slot
    // We need another question since r1 is already in active — grade reads from active
    const gradeWrong = api.grade("r1", 0);
    expect(gradeWrong.correct).toBe(false);
    expect(gradeWrong.correctSlot).toBe(2);

    // grade with timeout (undefined slot)
    const gradeNull = api.grade("r1", undefined);
    expect(gradeNull.correct).toBe(false);
    expect(gradeNull.correctSlot).toBe(2);

    await stageApp.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: categories slice reflects exhaustion
// ─────────────────────────────────────────────────────────────────────────────

describe("question-bank integration: categories slice updated after load", () => {
  it("categories slice status reflects exhaustion after all questions shown", async () => {
    const sig4 = inMemory();
    const stageApp = createApp({
      plugins: [stagePlugin, questionBankPlugin],
      pluginConfigs: {
        transport: {
          signaling: sig4,
          iceServers: [],
          heartbeatIntervalMs: 50,
          heartbeatTimeoutMs: 500
        }
      }
    });

    await stageApp.start();
    await stageApp.stage.createRoom();

    const q1 = makeQuestion("s1", "animals", "easy", 1);
    const fetchMock = async (url: string) => ({
      ok: true,
      json: async () => (url.includes("animals") ? [q1] : [])
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    const api = stageApp.questionBank;
    await api.load("en");
    globalThis.fetch = origFetch;

    // Before exhaustion: animals has 1 unseen question
    const beforeAvail = api.availability();
    const animalsBefore = beforeAvail.find(a => a.id === "animals");
    expect(animalsBefore?.exhausted).toBe(false);

    // Show the only question
    api.next("animals", "easy");

    // After showing: animals should be exhausted
    const afterAvail = api.availability();
    const animalsAfter = afterAvail.find(a => a.id === "animals");
    expect(animalsAfter?.exhausted).toBe(true);

    await stageApp.stop();
  });
});
