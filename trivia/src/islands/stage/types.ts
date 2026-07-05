/**
 * @file stage island — per-instance state + context types. The render layer (`render.tsx`) is a pure
 * function of this state; `lifecycle.ts` populates it from the room bridge.
 */
import type { QrMatrix } from "@moku-labs/room";
import type { Spa } from "@moku-labs/web/browser";
import type { BuildInfo } from "../../lib/build-info";
import type { TriviaState } from "../../lib/types";
import type { EndStats } from "../../plugins/scoring/types";

/**
 * The stage island's per-instance state (synced snapshot + UI-only bits). The transient overlays (mute,
 * reconnect/disconnect/pause) are their own islands now, so their state no longer lives here.
 */
export type StageState = {
  /** The merged synced snapshot. */
  s: TriviaState;
  /** The lobby QR matrix (fetched once after the room opens). */
  qr: QrMatrix | null;
  /** The room code (from the descriptor). */
  code: string;
  /** Ticking clock (ms) so deadline-driven UI re-renders. */
  now: number;
  /** End-of-match stats for the podium (host-read; `null` until final). */
  endStats: EndStats | null;
  /**
   * The running build's git identity (commit + subject + date), fetched once from `/build-info.json` for
   * the lobby version badge. `null`/absent until fetched, or when the build emitted no info. Optional so
   * the e2e fixtures set it only for the lobby screen.
   */
  buildInfo?: BuildInfo | null;
};

/** The stage island context (typed per-instance state). */
export type StageContext = Spa.IslandContext<StageState>;
