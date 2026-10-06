/**
 * @file A fake WebAudio context and a fake `window` for the headless e2e tests. They stand in for
 * the browser, not for the engine: the audio plugin takes any object shaped like `AudioContext`
 * through its `context` seam, and listens for the first pointer event on `window` to unlock.
 * Everything the plugin schedules is plain data here, so no test needs a sound card.
 */
import { vi } from "vitest";

/** The part of `AudioContext` the audio plugin uses, with the iOS `interrupted` state. */
export type FakeContext = Pick<
  AudioContext,
  | "destination"
  | "currentTime"
  | "createGain"
  | "createBufferSource"
  | "decodeAudioData"
  | "createMediaElementSource"
  | "resume"
  | "close"
> & { state: AudioContext["state"] | "interrupted" };

/** A `window` a test can dispatch on, without a DOM. */
export type FakeWindow = {
  addEventListener(type: string, handler: (event: unknown) => void, options?: unknown): void;
  removeEventListener(type: string, handler: (event: unknown) => void): void;
  dispatch(type: string): void;
};

/**
 * A node that connects and disconnects, and records nothing.
 *
 * @returns The node.
 */
function fakeNode(): { connect(): void; disconnect(): void } {
  return { connect: () => undefined, disconnect: () => undefined };
}

/**
 * A gain node whose gain takes every value and schedule it is given.
 *
 * @returns The node, as the plugin holds it.
 */
function fakeGain(): GainNode {
  const gain = {
    value: 1,
    setValueAtTime: (value: number) => {
      gain.value = value;
    },
    linearRampToValueAtTime: () => undefined
  };

  return { ...fakeNode(), gain } as unknown as GainNode;
}

/**
 * Creates the fake context. It starts suspended, as a browser's does before a gesture, and
 * decodes any bytes to a buffer that remembers their text.
 *
 * @returns The context.
 */
export function createFakeContext(): FakeContext {
  const context: FakeContext = {
    destination: fakeNode() as unknown as AudioDestinationNode,
    currentTime: 0,
    state: "suspended",
    createGain: fakeGain,
    createBufferSource: () =>
      ({
        ...fakeNode(),
        buffer: undefined,
        loop: false,
        start: () => undefined,
        stop: () => undefined
      }) as unknown as AudioBufferSourceNode,
    decodeAudioData: (data: ArrayBuffer) =>
      Promise.resolve({ key: new TextDecoder().decode(data) } as unknown as AudioBuffer),
    createMediaElementSource: () => fakeNode() as unknown as MediaElementAudioSourceNode,
    resume: () => {
      context.state = "running";

      return Promise.resolve();
    },
    close: () => {
      context.state = "closed";

      return Promise.resolve();
    }
  };

  return context;
}

/**
 * Creates the fake `window` and installs it as the global one. `vi.unstubAllGlobals()` takes it
 * away again.
 *
 * @returns The window, with `dispatch` to fire an event on it.
 */
export function installFakeWindow(): FakeWindow {
  const listeners: Array<{ type: string; handler: (event: unknown) => void; once: boolean }> = [];
  const fake: FakeWindow = {
    addEventListener: (type, handler, options) => {
      const once =
        typeof options === "object" &&
        options !== null &&
        "once" in options &&
        options.once === true;

      listeners.push({ type, handler, once });
    },
    removeEventListener: (type, handler) => {
      const at = listeners.findIndex(entry => entry.type === type && entry.handler === handler);

      if (at !== -1) listeners.splice(at, 1);
    },
    dispatch: type => {
      // A copy: a handler that removes a listener must not make the loop skip the next one.
      for (const entry of listeners.filter(candidate => candidate.type === type)) {
        if (entry.once) fake.removeEventListener(entry.type, entry.handler);

        entry.handler({ type });
      }
    }
  };

  vi.stubGlobal("window", fake);

  return fake;
}
