/**
 * @file Room CONTROLLER (phone) app composition — thin: the controller facade only (reads slices +
 * sends intents). No game plugins (host-authoritative).
 */
import { controllerPlugin, createApp } from "@moku-labs/room";

/**
 * Create the phone controller app (not started). The bridge owns its lifecycle.
 *
 * @returns The composed (unstarted) controller app.
 * @example
 * ```ts
 * const app = createControllerApp();
 * await app.start();
 * ```
 */
export function createControllerApp() {
  return createApp({ plugins: [controllerPlugin] });
}
