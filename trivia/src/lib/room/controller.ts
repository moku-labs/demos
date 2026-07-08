/**
 * @file Room CONTROLLER (phone) app composition — thin: the controller facade + the lifecycle
 * observer only (reads slices, sends intents). No game plugins (host-authoritative).
 */
import {
  controllerPlugin,
  createApp,
  type IceServersProvider,
  type Signaling,
  serverSignaling
} from "@moku-labs/room";
import { TRIVIA } from "../../config";
import { createRoomObserver } from "./observer";
import type { RoomLifecycle } from "./types";

/**
 * The default browser signaling seam — the deployed `@moku-labs/room/server` hub at this origin
 * (`http`→`ws` swapped). Mirrors the stage so a phone scanned from the TV reaches the same hub.
 *
 * @returns The `serverSignaling` adapter pointed at the current origin's hub.
 * @example
 * ```ts
 * createControllerApp(emit); // uses defaultSignaling() under the hood
 * ```
 */
function defaultSignaling(): Signaling {
  return serverSignaling(globalThis.location.origin.replace(/^http/, "ws"));
}

/**
 * Create the phone controller app (not started). The bridge owns its lifecycle.
 *
 * @param onLifecycle - The bridge's `room:*` sink (wired through the observer plugin).
 * @param signaling - Optional signaling override; tests inject the SAME `inMemory()` the stage uses
 *   so the two apps pair in-process. Defaults to the deployed hub at `location.origin`.
 * @param iceServers - Optional ICE servers (STUN + minted TURN relay) — an array, or the lazy async
 *   provider form (`fetchIceServers`) room resolves just before the first `RTCPeerConnection`, so the
 *   `/api/ice` fetch runs in parallel with the boot + join instead of on their critical path.
 *   Omitted, the transport keeps its public-STUN default. Mirrors the stage so both sides hold relay
 *   candidates.
 * @param iceTransportPolicy - Optional `RTCPeerConnection` policy; `"relay"` forces TURN-only pairs
 *   (the `?ice=relay` diagnostic toggle for proving the relay rung end-to-end). Omitted = `"all"`.
 * @returns The composed (unstarted) controller app.
 * @example
 * ```ts
 * const app = createControllerApp(emit);
 * await app.start();
 * await app.controller.joinRoom(code);
 * ```
 */
export function createControllerApp(
  onLifecycle: (event: RoomLifecycle) => void,
  signaling?: Signaling,
  iceServers?: readonly RTCIceServer[] | IceServersProvider,
  iceTransportPolicy?: RTCIceTransportPolicy
) {
  return createApp({
    plugins: [controllerPlugin, createRoomObserver(onLifecycle)],
    pluginConfigs: {
      transport: {
        signaling: signaling ?? defaultSignaling(),
        ...(iceServers ? { iceServers } : {}),
        ...(iceTransportPolicy ? { iceTransportPolicy } : {})
      },
      session: {
        codeLength: TRIVIA.codeLength,
        joinUrlBase: "",
        maxControllers: TRIVIA.players.max,
        generateQr: false
      }
    }
  });
}
