/**
 * @file Room STAGE (host) app composition — created only in the browser. Engines are room core
 * defaults; this adds the host facade, the four game plugins, and the lifecycle observer.
 */
import { createApp, type Signaling, serverSignaling, stagePlugin } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import { languagePlugin, matchFlowPlugin, questionBankPlugin, scoringPlugin } from "../../plugins";
import { createRoomObserver } from "./observer";
import type { RoomLifecycle } from "./types";

/**
 * The default browser signaling seam — the deployed `@moku-labs/room/server` hub at this origin.
 * `serverSignaling` wants a `ws(s)://` base, so the page origin's `http`→`ws` is swapped (D24:
 * `serverSignaling` deployments use the 8-char room code set on `session` below).
 *
 * @returns The `serverSignaling` adapter pointed at the current origin's hub.
 * @example
 * ```ts
 * createStageApp(emit); // uses defaultSignaling() under the hood
 * ```
 */
function defaultSignaling(): Signaling {
  return serverSignaling(globalThis.location.origin.replace(/^http/, "ws"));
}

/**
 * Create the host stage app (not started). The bridge owns its lifecycle.
 *
 * @param onLifecycle - The bridge's `room:*` sink (wired through the observer plugin).
 * @param signaling - Optional signaling override; tests inject a shared `inMemory()` so a stage +
 *   controller pair connect in-process. Defaults to the deployed hub at `location.origin` — with
 *   which room 0.8+ ALSO defaults the whole ICE relay rung (a lazy fail-open fetch of the hub's
 *   `/api/ice`, plus the `?ice=relay` force-relay diagnostic): no app-side ICE wiring exists.
 * @returns The composed (unstarted) stage app.
 * @example
 * ```ts
 * const app = createStageApp(emit);
 * await app.start();
 * const { code } = app.stage.createRoom();
 * ```
 */
export function createStageApp(onLifecycle: (event: RoomLifecycle) => void, signaling?: Signaling) {
  return createApp({
    plugins: [
      stagePlugin,
      questionBankPlugin,
      scoringPlugin,
      languagePlugin,
      matchFlowPlugin,
      createRoomObserver(onLifecycle)
    ],
    pluginConfigs: {
      transport: {
        signaling: signaling ?? defaultSignaling()
      },
      session: {
        codeLength: TRIVIA.codeLength,
        joinUrlBase: "",
        maxControllers: TRIVIA.players.max,
        generateQr: true
      }
    }
  });
}
