/**
 * @file Room-lifecycle observer — a tiny hooks-only plugin that forwards the five coarse `room:*`
 * events to the bridge's lifecycle emitter (the seam islands consume via `onLifecycle`).
 *
 * The Moku `App` exposes `emit` but no public event *subscription*, so the only way to observe the
 * engines' `room:*` lifecycle from outside a plugin is from inside one. This plugin owns no state,
 * config, or api — it depends on the three engines that declare the events (`transport` →
 * `room:network-warning`, `session` → `room:peer-joined`/`room:peer-left`/`room:host-reconnecting`,
 * `sync` → `room:sync-ready`) purely for compile-time event visibility (WARN-2; the runtime event bus
 * is global, so the hooks fire regardless of `depends`). All three engines are core defaults in BOTH
 * the stage and controller apps, so one observer factory serves both roles.
 */
import { createPlugin, sessionPlugin, syncPlugin, transportPlugin } from "@moku-labs/room";
import type { RoomLifecycle } from "./types";

/**
 * Build a room-lifecycle observer plugin that forwards every `room:*` event to `emit`.
 *
 * Added to a stage/controller app's `plugins` array; the bridge passes its own `emitLifecycle` as
 * `emit` so each event reaches the islands' `onLifecycle` subscribers (the D1 disconnect banner, the
 * C2 pause, the D3 reconnect strip, and network-warning UX).
 *
 * @param emit - The bridge's lifecycle sink, invoked once per `room:*` event.
 * @returns A hooks-only plugin instance to spread into `createApp({ plugins })`.
 * @example
 * ```ts
 * createApp({ plugins: [stagePlugin, createRoomObserver(emitLifecycle)] });
 * ```
 */
export function createRoomObserver(emit: (event: RoomLifecycle) => void) {
  return createPlugin("roomObserver", {
    depends: [transportPlugin, sessionPlugin, syncPlugin],
    /**
     * Map each `room:*` event to a forwarder into the bridge lifecycle sink.
     *
     * @returns The `room:*` hook map (one forwarder per coarse lifecycle event).
     * @example
     * ```ts
     * // Called automatically by the Moku kernel during app assembly.
     * ```
     */
    hooks: () => ({
      /**
       * Forward `room:peer-joined` to the bridge lifecycle sink.
       *
       * @param payload - The joined peer's id.
       * @example
       * ```ts
       * hooks: () => ({ "room:peer-joined": ({ peerId }) => {} });
       * ```
       */
      "room:peer-joined": payload => {
        emit({ kind: "peer-joined", peerId: payload.peerId });
      },
      /**
       * Forward `room:peer-left` to the bridge lifecycle sink.
       *
       * @param payload - The departed peer's id.
       * @example
       * ```ts
       * hooks: () => ({ "room:peer-left": ({ peerId }) => {} });
       * ```
       */
      "room:peer-left": payload => {
        emit({ kind: "peer-left", peerId: payload.peerId });
      },
      /**
       * Forward `room:host-reconnecting` to the bridge lifecycle sink.
       *
       * @example
       * ```ts
       * hooks: () => ({ "room:host-reconnecting": () => {} });
       * ```
       */
      "room:host-reconnecting": () => {
        emit({ kind: "host-reconnecting" });
      },
      /**
       * Forward `room:sync-ready` to the bridge lifecycle sink.
       *
       * @example
       * ```ts
       * hooks: () => ({ "room:sync-ready": () => {} });
       * ```
       */
      "room:sync-ready": () => {
        emit({ kind: "sync-ready" });
      },
      /**
       * Forward `room:network-warning` to the bridge lifecycle sink.
       *
       * @param payload - The connectivity warning reason.
       * @example
       * ```ts
       * hooks: () => ({ "room:network-warning": ({ reason }) => {} });
       * ```
       */
      "room:network-warning": payload => {
        emit({ kind: "network-warning", reason: payload.reason });
      }
    })
  });
}
