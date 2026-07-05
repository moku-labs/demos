/**
 * @file controller island — per-instance state + context types. The render layer (`render.tsx`) is a pure
 * function of this state; `lifecycle.ts` populates it from the room bridge and `handlers.ts` mutates it.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { JoinProfile } from "../../components/types";
import type { TriviaState } from "../../lib/types";

/**
 * This phone's own connectivity state (item 4 — connectivity audit), driven by `onLifecycle`:
 * `"ok"` — connected, no banner. `"reconnecting"` — a `network-warning` fired (join failed, or the
 * transport is recovering) and a self-heal window is running; shows the spinner. `"lost"` — the
 * self-heal window elapsed with no `sync-ready`; shows the Retry button (a manual nudge is needed).
 */
export type ConnectionStatus = "ok" | "reconnecting" | "lost";

/** The controller island's per-instance state. */
export type ControllerState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** Ticking clock (ms) for the countdown bar. */
  now: number;
  /** The room code from the deep-link (shown on the "Joining…" connecting card). */
  code: string;
  /**
   * The profile this phone submitted. Drives the honest "Joining…" connecting card while the phone is
   * NOT yet on the synced roster — never a "you're in" claim (a lost join frame could strand us here;
   * the real confirmation is the seated lobby card). Also set optimistically on a saved-identity
   * reconnect so the wizard is skipped while the seat re-syncs.
   */
  joinedProfile: JoinProfile | null;
  /**
   * The stable per-room player token sent with this session's `join-profile` (fresh join or reclaim).
   * Kept in island state (not re-read from storage) so the join self-heal can re-send the SAME
   * identity even when localStorage persistence failed (private mode / quota).
   */
  joinToken: string | null;
  /** The slot this phone locked for the current question (`null` = not locked). */
  lockedSlot: number | null;
  /** The question id the lock applies to (so a new question clears the lock). */
  lockedQid: string | null;
  /**
   * Phone-clock time (ms) at which this phone's steal lead-in ends and the answer grid unlocks — set when
   * the phone first sees the steal open (`Date.now() + stealLeadMs`), reset to `null` when it closes. The
   * "get ready" beat is timed as a LOCAL duration on this phone's own clock (skew-free, and independent of
   * the host's `armed` sync frame ever arriving — the steal-lock fix); `null` = no active steal. Optional
   * so the e2e fixtures (which inject a full state) only set it for the steal screens; `initState` seeds it.
   */
  stealArmAt?: number | null;
  /** Whether the leave modal is open. */
  leaving: boolean;
  /** Whether this phone has left the game (terminal). */
  left: boolean;
  /** This phone's own link status to the stage (item 4) — drives the connection-lost banner. */
  connection: ConnectionStatus;
};

/** The controller island context (typed per-instance state). */
export type ControllerContext = Spa.IslandContext<ControllerState>;
