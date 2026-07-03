/**
 * @file Bridge surface types — the room→island contract. Domain types come from `../types`.
 */

/** Coarse room lifecycle the bridge forwards to islands (room:* events; never gameplay). */
export type RoomLifecycle =
  | { kind: "peer-joined"; peerId: string }
  | { kind: "peer-left"; peerId: string }
  | { kind: "host-reconnecting" }
  | { kind: "sync-ready" }
  | { kind: "network-warning"; reason: string }
  /**
   * An intent exhausted the wire's at-least-once retransmit budget (room ≥0.4.0) — the engine
   * receipt-acks every delivered frame and retransmits unacked ones, so this fires only when the
   * channel is genuinely dead. The phone escalates straight to the connection-lost banner.
   */
  | { kind: "intent-undeliverable"; name: string };
