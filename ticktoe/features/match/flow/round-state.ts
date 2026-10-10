/**
 * @file What the nodes that start and leave a round share: how the round is cleared in the session.
 * It writes a session draft, so it is no rule: a rule is pure and may not read `@core/state`.
 */
import type { Session } from "@core/state";
import type { Cell } from "@core/types";
import { CELLS } from "../rules";

/**
 * Clears the round in the session: an empty board, no result, no line, no card, no pause. The
 * board is a new array every time, so no two rounds ever share one.
 *
 * @param session - The session draft of the running node.
 * @returns {void} Nothing: the draft is changed in place.
 */
export function clearRound(session: Session): void {
  session.board = Array.from({ length: CELLS }, (): Cell => 0);
  session.result = "none";
  session.winLine = [];
  session.card = false;
  session.botDueAt = 0;
}
