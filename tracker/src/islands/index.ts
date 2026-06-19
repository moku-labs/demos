/**
 * @file Island registry — the interactive components the SPA hydrates (web Rule R2).
 *
 * The spa plugin keys components by name (last-registered-wins), so each island owns a distinct
 * `data-component` region: `board-list` (home), `board` (the live board + every card interaction via
 * delegation), and `activity-panel` (the live worker feed).
 */
import { activityPanel } from "./activity-panel";
import { board } from "./board";
import { boardList } from "./board-list";

/** All islands registered with the spa plugin's component registry. */
export const islands = [boardList, board, activityPanel];
