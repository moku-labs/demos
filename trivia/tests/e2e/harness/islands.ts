/**
 * @file E2E harness — the fixture island registry.
 *
 * Wraps the REAL stage + controller render layers (the `src/islands/<role>/render.tsx` exports) in
 * islands whose state comes from the fixtures module instead of the room bridge. Because neither
 * fixture island calls `startStage`, NO room is opened and NO Hub WebSocket connects — so the screens
 * are fully deterministic and the reconnect strip never flashes.
 *
 * Overlay phases (C2, D1–D4) are rendered INLINE by the harness stage render wrapper — the separate
 * overlay islands (which need the room bridge) are NOT included, so they never flash or error.
 *
 * URL routing:
 * - `/?e2ephase=<StagePhaseKey>` → stage fixture (TV surface)
 * - `/controller/<code>?e2ephase=<PhonePhaseKey>` → controller fixture (phone surface)
 *
 * Imported ONLY by `spa-e2e.ts`, which is the client entry ONLY when `TRIVIA_E2E=1` (see `src/app.ts`),
 * so none of this — nor the fixtures — is ever part of the production bundle.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { CategoryExhaustedToast } from "../../../src/components/CategoryExhaustedToast";
import { DisconnectBanner } from "../../../src/components/DisconnectBanner";
import { EndCountdownChip } from "../../../src/components/EndCountdownChip";
import { PauseOverlay } from "../../../src/components/PauseOverlay";
import { ReconnectStrip } from "../../../src/components/ReconnectStrip";
import { render as controllerRender } from "../../../src/islands/controller/render";
import type { ControllerState } from "../../../src/islands/controller/types";
import { muteIsland } from "../../../src/islands/mute";
import { render as stageRender } from "../../../src/islands/stage/render";
import type { StageState } from "../../../src/islands/stage/types";
import type { HarnessStageState } from "./fixtures";
import { controllerFixtureState, parsePhase, parsePhonePhase, stageFixtureState } from "./fixtures";

/** Read the requested phase screen from the `?e2ephase=` query param. */
function phaseFromUrl() {
  return parsePhase(new URLSearchParams(globalThis.location.search).get("e2ephase"));
}

/** Read the requested phone phase screen from the `?e2ephase=` query param. */
function phonePhaseFromUrl() {
  return parsePhonePhase(new URLSearchParams(globalThis.location.search).get("e2ephase"));
}

/**
 * The harness stage render wrapper: renders the real stage render + any overlay component
 * indicated by the `overlay` discriminant in `HarnessStageState`.
 *
 * @param state - The harness stage state (StageState + optional overlay key).
 * @returns The stage view, with any overlay rendered inline.
 */
function harnessStageRender(state: Readonly<HarnessStageState>): Spa.RenderResult {
  const base = stageRender(state as Readonly<StageState>);

  const { overlay } = state;
  if (!overlay) return base;

  // Find the dropped player for the disconnect banner
  const droppedPlayer = state.s.players.find(p => !p.connected);
  const hostPlayer = state.s.players.find(p => p.peerId === state.s.match.hostPeer);

  const overlayEl = (() => {
    if (overlay === "pause") {
      return h(PauseOverlay, { name: hostPlayer?.name ?? "Mochi" });
    }
    if (overlay === "disconnect" && droppedPlayer) {
      return h(DisconnectBanner, {
        avatar: droppedPlayer.avatar,
        name: droppedPlayer.name,
        color: droppedPlayer.color,
        secondsLeft: 28,
        onDismiss: () => undefined
      });
    }
    if (overlay === "categoryExhausted") {
      return h(CategoryExhaustedToast, {
        category: "Animals: Weird & Wonderful",
        onDismiss: () => undefined
      });
    }
    if (overlay === "reconnect") {
      return h(ReconnectStrip, {});
    }
    if (overlay === "endCountdown") {
      return h(EndCountdownChip, { seconds: 5 });
    }
    return null;
  })();

  if (!overlayEl) return base;

  // Wrap the stage output and the overlay in a Fragment so both render without an extra DOM node.
  // Cast base to ComponentChild — RenderResult includes void but h() handles null/undefined.
  return h(Fragment, {}, base ?? null, overlayEl);
}

/** The TV stage island, rendering frozen fixture state (the real render; no room boot). */
const stageFixtureIsland = createIsland<HarnessStageState>("stage", {
  state: () => stageFixtureState(phaseFromUrl()),
  render: harnessStageRender
});

/** The phone controller island, rendering frozen fixture state (the real render; no room boot). */
const controllerFixtureIsland = createIsland<ControllerState>("controller", {
  state: () => controllerFixtureState(phonePhaseFromUrl()),
  render: controllerRender
});

/** The harness island registry (stage XOR controller mounts per route; mute stays for chrome fidelity). */
export const fixtureIslands = [stageFixtureIsland, controllerFixtureIsland, muteIsland];
