/**
 * @file controller island — per-instance state + context types. The render layer (`render.tsx`) is a pure
 * function of this state; `lifecycle.ts` populates it from the room bridge and `handlers.ts` mutates it.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { JoinProfile } from "../../components/types";
import type { TriviaState } from "../../lib/types";

/** The controller island's per-instance state. */
export type ControllerState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** Ticking clock (ms) for the countdown bar. */
  now: number;
  /** The room code from the deep-link (shown on the "You're in!" card). */
  code: string;
  /** The profile this phone submitted (drives the "You're in!" confirmation pre-roster). */
  joinedProfile: JoinProfile | null;
  /** The slot this phone locked for the current question (`null` = not locked). */
  lockedSlot: number | null;
  /** The question id the lock applies to (so a new question clears the lock). */
  lockedQid: string | null;
  /** Whether the leave modal is open. */
  leaving: boolean;
  /** Whether this phone has left the game (terminal). */
  left: boolean;
};

/** The controller island context (typed per-instance state). */
export type ControllerContext = Spa.IslandContext<ControllerState>;
