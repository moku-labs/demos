/**
 * @file The node `setLevel` called on its own, with a stub context: the two rules of its sound
 * that no walk shows. In a headless walk no handler plays a sound, and the game on a screen only
 * presses a level it does not have yet.
 */
import { sfx } from "@core/kit";
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { describe, expect, it } from "vitest";
import { setLevel } from "../../flow/set-level";

// oxlint-disable-next-line unicorn/no-null -- the runner hands an answer without a payload on as null
const NO_PAYLOAD = null;

/** A node, as far as a direct call needs it. */
type Runnable = { run?: (context: never) => unknown };

/**
 * Builds the context of one node run: drafts a test can read back, an `fx` that records every
 * effect the node started, and an `out` that names the outcome taken.
 */
function contextOf(fields: { input?: unknown; player?: Player; session?: Partial<Session> } = {}) {
  const started: unknown[] = [];
  const fx = (descriptor: unknown) => {
    started.push(descriptor);

    // A sound never answers here: a node that waited for one would never end its run.
    return (descriptor as { kind?: unknown }).kind === "sfx"
      ? new Promise<never>(() => undefined)
      : Promise.resolve();
  };
  const context = {
    input: fields.input,
    player: structuredClone(fields.player ?? startingPlayer),
    session: structuredClone({ ...startingSession, ...fields.session }) as Session,
    fx,
    out: new Proxy({}, { get: (_target, outcome) => () => outcome })
  };

  return { context, started };
}

/** Runs a node with a context and answers the name of the outcome it took. */
async function outcomeOf(node: Runnable, context: unknown): Promise<unknown> {
  return await node.run?.(context as never);
}

describe("setLevel", () => {
  it("sounds for the level that is already saved too: the option was pressed", async () => {
    const { context, started } = contextOf({
      input: { level: "normal" },
      player: { ...startingPlayer, level: "normal" }
    });

    await outcomeOf(setLevel, context);

    expect(context.player.level).toBe("normal");
    expect(started).toEqual([sfx("match.level")]);
  });

  it("makes no sound for an answer that picks no level, and keeps the saved one", async () => {
    for (const input of [{ level: "expert" }, {}, undefined, NO_PAYLOAD, "hard"]) {
      const { context, started } = contextOf({
        input,
        player: { ...startingPlayer, level: "easy" }
      });

      expect(await outcomeOf(setLevel, context)).toBe("done");
      expect(context.player.level).toBe("easy");
      expect(started).toEqual([]);
    }
  });
});
