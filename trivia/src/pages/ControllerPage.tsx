/**
 * @file ControllerPage — the phone/controller route content. Mounts the persistent `controller` island
 * host; the island renders the current phase + this player's role from the bridge.
 */
import type { VNode } from "preact";

/**
 * Render the controller page — the mount point for the `controller` island.
 *
 * @returns The controller island host section.
 * @example
 * ```tsx
 * route("/controller/{code}").layout(ControllerLayout).render(() => <ControllerPage />);
 * ```
 */
export function ControllerPage(): VNode {
  return <section data-island="controller" />;
}
