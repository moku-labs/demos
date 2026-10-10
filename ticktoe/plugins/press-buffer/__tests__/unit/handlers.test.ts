/**
 * @file The handlers of `pressBuffer` over a hand-made state and a stand-in for the graph: a gate
 * the test opens and closes, which records every answer it is given. Only what no app of the
 * other suites reaches is here: a fast walk, a gate that lists the intent only later, a gate that
 * refuses its own answer, and an edge that carries no payload.
 */
import type { Flow } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { onEdge, onFrame, onTap } from "../../handlers";
import { createPressBufferState } from "../../state";
import type { Graph } from "../../types";

/** How long the tests keep a press: the number of the game. */
const KEEP_MS = 500;

/** A tap on the tile of a cell. */
const tile = (cell: number) => ({ intent: "tap", payload: { cell } });

/** A press of a button that carries nothing, as the engine builds it. */
const button = (intent: string) => ({ intent, payload: {} });

/**
 * A stand-in for the graph. The test sets what the gate takes and the mode; `answers` keeps every
 * answer the handlers gave, and `taken` is what the gate says to each of them.
 */
function graphOf(start: { open: boolean; allowed?: readonly string[] }) {
  const gate = { open: start.open, allowed: start.allowed ?? [], taken: true };
  const flow: { mode: "live" | "fast" } = { mode: "live" };
  const answers: Flow.Answer[] = [];
  const graph: Graph = {
    gate: {
      state: () => ({ open: gate.open, allowed: gate.open ? gate.allowed : [], narrowed: false }),
      answer: answer => {
        answers.push(answer);

        return gate.taken;
      }
    },
    state: () => ({ mode: flow.mode })
  };

  return { graph, gate, flow, answers };
}

describe("onTap", () => {
  it("keeps nothing during a fast walk", () => {
    const state = createPressBufferState();
    const { graph, flow } = graphOf({ open: false });

    flow.mode = "fast";
    onTap(state, tile(4), graph, 1000);

    expect(state.press).toBeUndefined();
  });
});

describe("onFrame", () => {
  it("answers a later gate that lists the intent, while the press is young enough", () => {
    const state = createPressBufferState();
    const { graph, gate, answers } = graphOf({ open: false });

    onTap(state, tile(4), graph, 1000);
    gate.open = true;
    gate.allowed = ["elapsed"];
    onFrame(state, KEEP_MS, graph, 1100);
    gate.allowed = ["tap", "home"];
    onFrame(state, KEEP_MS, graph, 1200);

    expect(answers).toEqual([{ intent: "tap", payload: { cell: 4 } }]);
  });

  it("offers the press once even when the gate refuses the answer", () => {
    const state = createPressBufferState();
    const { graph, gate, answers } = graphOf({ open: false });

    onTap(state, tile(4), graph, 1000);
    gate.open = true;
    gate.allowed = ["tap"];
    // What a gate narrowed by a guide says to an answer it lists.
    gate.taken = false;
    onFrame(state, KEEP_MS, graph, 1016);
    onFrame(state, KEEP_MS, graph, 1032);

    expect(answers).toHaveLength(1);
    expect(state.press).toBeUndefined();
  });

  it("forgets the press when the graph went into a fast walk", () => {
    const state = createPressBufferState();
    const { graph, gate, flow, answers } = graphOf({ open: false });

    onTap(state, tile(4), graph, 1000);
    flow.mode = "fast";
    gate.open = true;
    gate.allowed = ["tap"];
    onFrame(state, KEEP_MS, graph, 1016);

    expect(answers).toEqual([]);
    expect(state.press).toBeUndefined();
  });
});

describe("onEdge", () => {
  it.each([
    ["no payload", undefined],
    ["an empty payload", {}],
    // oxlint-disable-next-line unicorn/no-null -- a JSON payload may be null, and an edge may carry it
    ["a null payload", null]
  ])("takes a button that carries nothing for served by an edge with %s", (_name, payload) => {
    const state = createPressBufferState();
    const { graph } = graphOf({ open: false });

    onTap(state, button("play"), graph, 1000);
    // An outcome without a payload leaves the edge with none, whatever the type says.
    onEdge(state, { outcome: "play", payload: payload as Flow.Events["flow:edge"]["payload"] });

    expect(state.press).toBeUndefined();
  });
});
