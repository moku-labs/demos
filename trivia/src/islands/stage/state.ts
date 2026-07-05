/**
 * @file stage island — the createState factory: a pristine lobby snapshot. The room boots and the live
 * snapshot + QR arrive in `lifecycle.ts` (`onMount`).
 */
import { snapshot } from "../../lib/room";
import type { StageState } from "./types";

/**
 * Build the initial stage state (a pristine lobby snapshot; the room boots in `onMount`).
 *
 * @returns The initial stage state.
 * @example
 * ```ts
 * createIsland("stage", { state: initState });
 * ```
 */
export function initState(): StageState {
  return {
    s: snapshot(),
    // eslint-disable-next-line unicorn/no-null -- the bridge's QR vocabulary is null until fetched
    qr: null,
    code: "",
    now: Date.now(),
    // eslint-disable-next-line unicorn/no-null -- end stats are null until the match reaches final
    endStats: null,
    // eslint-disable-next-line unicorn/no-null -- null until `/build-info.json` is fetched in onMount
    buildInfo: null
  };
}
