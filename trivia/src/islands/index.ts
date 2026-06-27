/**
 * @file Island registry — the persistent surfaces the SPA hydrates (web Rule R2). Each is a
 * `createIsland(...)` bound to a `data-island="…"` host in the page markup; the spa plugin mounts the
 * matching island on every host it finds. Registered here → `pluginConfigs.spa.islands` in spa.tsx.
 *
 * - **Surfaces** — `stage` (the TV) · `controller` (the phone).
 * - **Stage overlays** — `reconnect-strip` · `disconnect-banner` · `pause-overlay` (transient,
 *   bridge-snapshot/lifecycle driven) · `mute` (the chrome control). Hosted in {@link
 *   file://../pages/StagePage.tsx} as siblings of the stage host.
 */
import { controllerIsland } from "./controller";
import { disconnectBannerIsland } from "./disconnect-banner";
import { muteIsland } from "./mute";
import { pauseOverlayIsland } from "./pause-overlay";
import { reconnectStripIsland } from "./reconnect-strip";
import { stageIsland } from "./stage";

/** Every island registered with the spa plugin's component registry (wired in `spa.tsx`). */
export const islands = [
  stageIsland,
  controllerIsland,
  reconnectStripIsland,
  disconnectBannerIsland,
  pauseOverlayIsland,
  muteIsland
];
