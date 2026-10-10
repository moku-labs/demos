/**
 * @file The handler of the plugin `flowLog`: the event `flow:error` in, one error entry of the log
 * out. A pure function over the payload and a `write` callback; `index.ts` binds `write` to the log.
 */
import type { Flow } from "@moku-labs/game";

/**
 * The name of the log entry. It is the name of the event the entry records, so the engine's own
 * list of events says what the entry holds.
 */
export const FLOW_ERROR = "flow:error";

/**
 * What an entry says next to the error: the node that failed, the place the graph went back to,
 * and whether the runner tries the transition again or gave up and entered the safe node.
 */
export type Failure = Pick<Flow.Events["flow:error"], "path" | "rolledBackTo" | "retry">;

/**
 * Writes one error entry into the log: its name, what it says, and the error itself. The log
 * merges the message and the stack of the error into the entry.
 */
export type WriteError = (event: string, data: Failure, error: Error) => void;

/**
 * Makes an error of what a node threw. A node may throw anything, and the log takes only an
 * `Error`: a value that is none becomes the message of a new one.
 *
 * @param thrown - What the node failed with.
 * @returns The error itself, or a new one that carries the value as text.
 * @example
 * ```ts
 * asError(new TypeError("No cell 9.")); // the same TypeError
 * asError("out of cells").message; // "out of cells"
 * ```
 */
function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Writes one failed node into the log. The runner emits `flow:error` once per failure, so a
 * transition that fails twice leaves two entries: the first with `retry: true` and the rest point
 * it went back to, the second with `retry: false` and the safe node.
 *
 * @param payload - The event `flow:error`.
 * @param write - Writes one error entry into the log.
 * @returns {void} Nothing: what it has to say goes through `write`.
 */
export function onFlowError(payload: Flow.Events["flow:error"], write: WriteError): void {
  const { path, rolledBackTo, retry } = payload;

  write(FLOW_ERROR, { path, rolledBackTo, retry }, asError(payload.error));
}
