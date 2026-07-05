/**
 * @file StageLobby — the TV lobby screen (A1): room code + QR on the left, the joining players on the
 * right. A pure presentational component fed the merged snapshot slices the stage island reads; it sends
 * nothing (the host is authoritative). Rendered by the stage island's render layer for `phase === "lobby"`.
 */
import type { QrMatrix } from "@moku-labs/room";
import type { JSX } from "preact";
import { TRIVIA } from "../config";
import type { BuildInfo } from "../lib/build-info";
import type { TriviaState } from "../lib/types";
import { PlayerTile } from "./PlayerTile";
import { QrBlock } from "./QrBlock";
import { RoomCodeBadge } from "./RoomCodeBadge";

/** Props for the lobby screen. */
export type StageLobbyProps = {
  /** The merged synced snapshot (players + room state). */
  s: TriviaState;
  /** The lobby QR matrix (fetched once after the room opens). */
  qr: QrMatrix | null;
  /** The room code (from the descriptor). */
  code: string;
  /**
   * The running build's git identity (commit + subject + date), shown as a small corner badge so the
   * deployed version is identifiable at a glance. Omitted/`null` → the badge is hidden.
   */
  buildInfo?: BuildInfo | null | undefined;
  /** Regenerate the room (new code + QR). When omitted, the reset control is hidden. */
  onReset?: () => void;
};

/**
 * Render the TV lobby — room code + QR, plus the live joining-players grid (padded to the max slots).
 *
 * @param props - The lobby screen props.
 * @returns The lobby screen.
 * @example
 * ```tsx
 * <StageLobby s={s} qr={qr} code={code} onReset={resetRoom} />
 * ```
 */
export function StageLobby({ s, qr, code, buildInfo, onReset }: StageLobbyProps): JSX.Element {
  const joined = s.players.filter(p => p.connected).length;
  const slots = Math.max(TRIVIA.players.max, s.players.length);
  const empties = Math.max(0, slots - s.players.length);

  return (
    <div data-component="stage-lobby" data-screen="lobby">
      <div data-lobby-join>
        <RoomCodeBadge code={code || "····"} />
        <QrBlock matrix={qr} hint="Scan to join — or enter the code" />
        {onReset ? (
          <button
            type="button"
            data-reset
            onClick={event => {
              // One activation only: `onReset` triggers a full-page reload, and a double-tap that
              // lands before the old document tears down would otherwise fire a SECOND reload.
              event.currentTarget.disabled = true;
              onReset();
            }}
            aria-label="Generate a new room code"
          >
            ↻ New code
          </button>
        ) : null}
      </div>
      <div data-lobby-players>
        <h2 data-heading>Players joining</h2>
        <div data-player-grid>
          {s.players.map((player, index) => (
            <PlayerTile key={player.peerId} player={player} index={index} />
          ))}
          {Array.from({ length: empties }, (_, i) => (
            <PlayerTile key={`empty-${i}`} empty />
          ))}
        </div>
        <p data-help>
          {joined} / {TRIVIA.players.max} players joined · Waiting for host to start…
        </p>
      </div>
      {buildInfo ? (
        <footer data-build-badge>
          <code data-build-commit>{buildInfo.commit}</code>
          {buildInfo.subject ? <span data-build-msg>{buildInfo.subject}</span> : null}
          {buildInfo.date ? <time data-build-date>{buildInfo.date.slice(0, 10)}</time> : null}
        </footer>
      ) : null}
    </div>
  );
}
