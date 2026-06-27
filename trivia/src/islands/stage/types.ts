/**
 * @file stage island — per-instance state + context types. The render layer (`render.tsx`) is a pure
 * function of this state; `lifecycle.ts` populates it from the room bridge.
 */
import type { QrMatrix } from "@moku-labs/room";
import type { Spa } from "@moku-labs/web/browser";
import type { TriviaState } from "../../lib/types";
import type { EndStats } from "../../plugins/scoring/types";

/** The stage island's per-instance state (synced snapshot + UI-only bits). */
export type StageState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** Mute toggle (wired; audio is out of scope for v1). */
  muted: boolean;
  /** The lobby QR matrix (fetched once after the room opens). */
  qr: QrMatrix | null;
  /** The room code (from the descriptor). */
  code: string;
  /** Ticking clock (ms) so deadline-driven UI re-renders. */
  now: number;
  /** Whether a transient reconnect strip is showing. */
  reconnecting: boolean;
  /** Whether the disconnect banner was dismissed this drop. */
  dismissedDisconnect: boolean;
  /** End-of-match stats for the podium (host-read; `null` until final). */
  endStats: EndStats | null;
};

/** The stage island context (typed per-instance state). */
export type StageContext = Spa.IslandContext<StageState>;
