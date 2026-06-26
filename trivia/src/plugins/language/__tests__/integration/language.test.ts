import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { afterEach, describe, expect, it, vi } from "vitest";
import { languagePlugin } from "../../index";
import { clearVoteTimer } from "../../vote-timer";

// ---------------------------------------------------------------------------
// Integration: language plugin with the real room framework
// ---------------------------------------------------------------------------

describe("language plugin integration", () => {
  afterEach(() => {
    // Ensure module-closure timer is cleared between tests
    clearVoteTimer();
    vi.useRealTimers();
  });

  // ─── slice + intent round-trip ─────────────────────────────────────────

  it("languageVote slice updates on the controller replica when peers send language-vote intent", {
    timeout: 10_000
  }, async () => {
    const sig = inMemory();
    const host = createApp({
      plugins: [stagePlugin, languagePlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });
    const controller = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });

    await host.start();
    await controller.start();

    const { code } = host.stage.createRoom();
    await controller.controller.joinRoom(code);

    // Wait for the initial sync snapshot to arrive on the controller
    await vi.waitFor(
      () => {
        expect(controller.controller.read("languageVote")).toBeDefined();
      },
      { timeout: 4000 }
    );

    // Open the vote on the host (slice becomes open:true) using a short window
    // so the real timer doesn't fire during the assertion window below
    const onConfirm = vi.fn();
    host.language.openVote(onConfirm);

    // Controller sends a language-vote intent
    controller.controller.intent("language-vote", { lang: "ru" });

    // Wait for the slice update to propagate — open:true and options updated
    await vi.waitFor(
      () => {
        expect(controller.controller.read("languageVote")?.open).toBe(true);
      },
      { timeout: 4000 }
    );

    const cells = controller.controller.read("languageVote");
    expect(cells?.open).toBe(true);

    // Clean up: cancel the vote
    host.language.cancelVote();

    await host.stop();
    await controller.stop();
  });

  it("after voteWindowMs the host confirms + onConfirm fires once", {
    timeout: 10_000
  }, async () => {
    const sig = inMemory();
    const host = createApp({
      plugins: [stagePlugin, languagePlugin],
      pluginConfigs: {
        transport: { signaling: sig },
        session: { generateQr: false },
        language: { voteWindowMs: 200 }
      }
    });
    const controller = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });

    await host.start();
    await controller.start();

    const { code } = host.stage.createRoom();
    await controller.controller.joinRoom(code);

    // Wait for the initial sync snapshot
    await vi.waitFor(
      () => {
        expect(controller.controller.read("languageVote")).toBeDefined();
      },
      { timeout: 4000 }
    );

    const onConfirm = vi.fn();
    host.language.openVote(onConfirm);

    // Controller votes for "ru"
    controller.controller.intent("language-vote", { lang: "ru" });

    // Wait for onConfirm to fire (voteWindowMs is 200ms)
    await vi.waitFor(
      () => {
        expect(onConfirm).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    // onConfirm should have fired exactly once with "ru"
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("ru");

    // result() should now return "ru"
    expect(host.language.result()).toBe("ru");

    await host.stop();
    await controller.stop();
  });
});
