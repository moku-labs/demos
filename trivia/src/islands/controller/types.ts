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
  /** The room code from the deep-link (shown on the "You're in!" card). */
  code: string;
  /** The profile this phone submitted (drives the "You're in!" confirmation pre-roster). */
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
   * When this phone locked its slot (`Date.now()` at the tap; `null` = no lock this session). The
   * lock self-heal watchdog measures its ack window from here: the lock UI is optimistic (tiles
   * disable immediately) while the `answer-lock` intent rides an at-most-once wire, so a lost frame
   * would otherwise strand the round until the host's own question timeout.
   */
  lockedAtTs: number | null;
  /** Whether the leave modal is open. */
  leaving: boolean;
  /** Whether this phone has left the game (terminal). */
  left: boolean;
  /** This phone's own link status to the stage (item 4) — drives the connection-lost banner. */
  connection: ConnectionStatus;
};

/** The controller island context (typed per-instance state). */
export type ControllerContext = Spa.IslandContext<ControllerState>;
