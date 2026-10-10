/**
 * @file Types of the plugin `pressBuffer`.
 */
import type { Flow, Model } from "@moku-labs/game";

/**
 * How long a press is kept.
 */
export type Config = {
  /**
   * How long a press a closed gate refused is kept, in milliseconds of `time`: the frames of the
   * game, as the animations that close the gate count them. An older press is forgotten.
   */
  keepMs: number;
};

/**
 * What a tapped view answers the gate with: the `Tappable` of a button or of a tile.
 */
export type Tapped = { intent: string; payload: Model.Json };

/**
 * A press the plugin keeps: what the view answers, and the moment of `time` it was made at.
 */
export type Press = Tapped & { at: number };

/**
 * What the plugin remembers between a press and the gate that opens.
 */
export type State = {
  /** The last press a closed gate refused, until it is answered, replaced or too old. */
  press: Press | undefined;
  /** The removers of the tap listener and of the frame step. `onStop` calls them. */
  off: (() => void)[];
};

/**
 * What the handlers ask of the graph: what the gate takes now, the one entry of answers, and
 * whether the graph runs live. `app.flow` is one.
 */
export type Graph = {
  gate: Pick<Flow.GateApi, "state" | "answer">;
  state(): Pick<Flow.FlowState, "mode">;
};

/**
 * What the handlers read of an edge the graph took: its outcome and what it carried.
 */
export type Edge = Pick<Flow.Events["flow:edge"], "outcome" | "payload">;
