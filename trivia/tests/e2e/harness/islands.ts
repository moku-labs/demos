/**
 * @file E2E harness — the fixture island registry.
 *
 * Wraps the REAL stage + controller render layers (the `src/islands/<role>/render.tsx` exports) in
 * islands whose state comes from the fixtures module instead of the room bridge. Because neither
 * fixture island calls `startStage`,
 * NO room is opened and NO Hub WebSocket connects — so the screens are fully deterministic and the
 * reconnect strip never flashes. The real overlay/mute islands are included for chrome fidelity; against
 * the un-booted bridge they resolve to `emptyState()` and stay hidden.
 *
 * Imported ONLY by `spa-e2e.ts`, which is the client entry ONLY when `TRIVIA_E2E=1` (see `src/app.ts`),
 * so none of this — nor the fixtures — is ever part of the production bundle.
 */
import { createIsland } from "@moku-labs/web/browser";
import { render as controllerRender } from "../../../src/islands/controller/render";
import type { ControllerState } from "../../../src/islands/controller/types";
import { disconnectBannerIsland } from "../../../src/islands/disconnect-banner";
import { muteIsland } from "../../../src/islands/mute";
import { pauseOverlayIsland } from "../../../src/islands/pause-overlay";
import { reconnectStripIsland } from "../../../src/islands/reconnect-strip";
import { render as stageRender } from "../../../src/islands/stage/render";
import type { StageState } from "../../../src/islands/stage/types";
import { controllerFixtureState, parsePhase, stageFixtureState } from "./fixtures";

/** Read the requested phase screen from the `?e2ephase=` query param. */
function phaseFromUrl() {
  return parsePhase(new URLSearchParams(globalThis.location.search).get("e2ephase"));
}

/** The TV stage island, rendering frozen fixture state (the real render; no room boot). */
const stageFixtureIsland = createIsland<StageState>("stage", {
  state: () => stageFixtureState(phaseFromUrl()),
  render: stageRender
});

/** The phone controller island, rendering frozen fixture state (the real render; no room boot). */
const controllerFixtureIsland = createIsland<ControllerState>("controller", {
  state: () => controllerFixtureState(phaseFromUrl()),
  render: controllerRender
});

/** The harness island registry (stage XOR controller mounts per route; overlays stay hidden). */
export const fixtureIslands = [
  stageFixtureIsland,
  controllerFixtureIsland,
  reconnectStripIsland,
  disconnectBannerIsland,
  pauseOverlayIsland,
  muteIsland
];
