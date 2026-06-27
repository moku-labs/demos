/**
 * @file StagePage — the TV/stage route content. Mounts the persistent `stage` island host (which renders
 * the current match phase from the bridge) plus the standalone overlay islands that sit on top of it:
 * the reconnect strip, the disconnect banner, the pause takeover, and the mute control. The overlay hosts
 * start `hidden` (their islands unhide on the matching bridge signal).
 */
import type { VNode } from "preact";

/**
 * Render the stage page — the `stage` island host + its sibling overlay/control island hosts.
 *
 * @returns The stage island hosts.
 * @example
 * ```tsx
 * route("/").layout(StageLayout).render(() => <StagePage />);
 * ```
 */
export function StagePage(): VNode {
  return (
    <>
      <section data-island="stage" />
      <section data-island="reconnect-strip" hidden />
      <section data-island="disconnect-banner" hidden />
      <section data-island="pause-overlay" hidden />
      <section data-island="mute" />
    </>
  );
}
