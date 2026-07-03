/**
 * @file controller island — the createState factory: a pristine snapshot. The room joins (from the
 * deep-link code) and the live snapshot arrives in `lifecycle.ts` (`onMount`).
 */
import { snapshot } from "../../lib/room";
import type { ControllerState } from "./types";

/**
 * Build the initial controller state (pristine snapshot; the room joins in `onMount`).
 *
 * @returns The initial controller state.
 * @example
 * ```ts
 * createIsland("controller", { state: initState });
 * ```
 */
export function initState(): ControllerState {
  return {
    s: snapshot(),
    now: Date.now(),
    code: "",
    // eslint-disable-next-line unicorn/no-null -- the bridge speaks null for "no joined profile yet"
    joinedProfile: null,
    // eslint-disable-next-line unicorn/no-null -- null = "no join sent this session yet"
    joinToken: null,
    // eslint-disable-next-line unicorn/no-null -- null = "no slot locked", never undefined
    lockedSlot: null,
    // eslint-disable-next-line unicorn/no-null -- null = "no locked question", never undefined
    lockedQid: null,
    leaving: false,
    left: false,
    connection: "ok"
  };
}
