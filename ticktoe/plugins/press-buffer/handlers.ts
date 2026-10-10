/**
 * @file The handlers of the plugin `pressBuffer`: a tap in, a frame in, an edge in, and at most one
 * answer to the gate out. Each one is a pure function over the plugin state and the graph;
 * `index.ts` binds them to the input, the frame loop and the flow.
 */
import type { Model } from "@moku-labs/game";
import type { Edge, Graph, State, Tapped } from "./types";

/**
 * Writes down what a payload carries, so two payloads can be compared. A button without a payload
 * answers `{}`, and an outcome without one leaves its edge with none: both carry nothing, and both
 * read the same here.
 *
 * @param payload - The payload of a press or of an edge.
 * @returns Its data as JSON text.
 * @example
 * ```ts
 * dataOf({ cell: 4 }); // '{"cell":4}'
 * dataOf(undefined); // "{}", as dataOf({}) is
 * ```
 */
function dataOf(payload: Model.Json | undefined): string {
  return JSON.stringify(payload ?? {});
}

/**
 * Hears one tap, before the gate is asked. A newer press always takes the place of the kept one.
 * It is kept itself only when the gate is closed: an open gate takes the press or refuses it by
 * its own list, and both stand. Nothing is kept during a fast walk: there every animation ends at
 * once and the route answers the gate itself.
 *
 * @param state - The plugin state.
 * @param tapped - What the tapped view answers, or `undefined` when it names no intent.
 * @param graph - The graph: its gate and its mode.
 * @param now - The moment of `time` the tap was made at.
 * @returns {void} Nothing: the press is kept in the state.
 */
export function onTap(state: State, tapped: Tapped | undefined, graph: Graph, now: number): void {
  // A view that names no intent answers nothing: it is no press.
  if (tapped === undefined) return;

  const isRefused = !graph.gate.state().open && graph.state().mode === "live";

  state.press = isRefused ? { intent: tapped.intent, payload: tapped.payload, at: now } : undefined;
}

/**
 * Looks at the kept press once per frame. A press older than `keepMs` is forgotten, and so is one
 * a fast walk overtook. Else the gate is answered with it in the first frame the gate is open and
 * lists its intent: a tap on a tile never becomes Play. The press is offered once: the state is
 * emptied before the answer, whatever the gate says to it.
 *
 * @param state - The plugin state.
 * @param keepMs - How long a press is kept, in milliseconds of `time`.
 * @param graph - The graph: its gate and its mode.
 * @param now - The moment of `time` of this frame.
 * @returns {void} Nothing: what it has to say goes to the gate.
 */
export function onFrame(state: State, keepMs: number, graph: Graph, now: number): void {
  const press = state.press;

  if (press === undefined) return;

  if (now - press.at > keepMs || graph.state().mode !== "live") {
    state.press = undefined;

    return;
  }

  const gate = graph.gate.state();

  if (!gate.open || !gate.allowed.includes(press.intent)) return;

  state.press = undefined;
  graph.gate.answer({ intent: press.intent, payload: press.payload });
}

/**
 * Hears one edge of the graph. The engine keeps a refused answer for one frame itself and offers
 * it again when the gate opens within that frame. The edge that follows then has the intent of
 * the kept press as its outcome and carries its payload: the press was served, so it is forgotten
 * and no later gate gets it a second time.
 *
 * @param state - The plugin state.
 * @param edge - The event `flow:edge`.
 * @returns {void} Nothing: the state is changed in place.
 */
export function onEdge(state: State, edge: Edge): void {
  const press = state.press;

  if (press === undefined || press.intent !== edge.outcome) return;
  if (dataOf(press.payload) !== dataOf(edge.payload)) return;

  state.press = undefined;
}

/**
 * Takes the tap listener and the frame step away, and forgets the kept press. A second call
 * finds nothing to remove.
 *
 * @param state - The plugin state.
 * @returns {void} Nothing: the state is changed in place.
 */
export function onStop(state: State): void {
  for (const off of state.off) off();

  state.off = [];
  state.press = undefined;
}
