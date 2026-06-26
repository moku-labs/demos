/**
 * @file Bridge surface types — the room→island contract. Domain types come from `../types`.
 */

/** Coarse room lifecycle the bridge forwards to islands (room:* events; never gameplay). */
export type RoomLifecycle =
  | { kind: "peer-joined"; peerId: string }
  | { kind: "peer-left"; peerId: string }
  | { kind: "host-reconnecting" }
  | { kind: "sync-ready" }
  | { kind: "network-warning"; reason: string };
