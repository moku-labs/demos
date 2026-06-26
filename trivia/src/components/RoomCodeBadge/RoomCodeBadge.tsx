import type { JSX } from "preact";
import type { RoomCodeBadgeProps } from "../types";

/**
 * The large lemon room-code badge on the TV lobby (design §6 A1, §G "Room code badge").
 *
 * A translucent dark rounded card with a small spaced-caps "ROOM CODE" label above the join `code`
 * set big in lemon Fredoka with wide letter-spacing and a glowing text-shadow.
 *
 * @param props - The badge props.
 * @param props.code - The room code to display (e.g. `"4F2K"`).
 * @returns The room-code badge.
 * @example
 * ```tsx
 * <RoomCodeBadge code="4F2K" />
 * ```
 */
export function RoomCodeBadge({ code }: RoomCodeBadgeProps): JSX.Element {
  return (
    <div data-component="room-code-badge">
      <span data-label>Room Code</span>
      <span data-code>{code}</span>
    </div>
  );
}
