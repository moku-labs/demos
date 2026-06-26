/**
 * @file StagePage — the TV/stage route content. Mounts the persistent `stage` island host; the island
 * renders the current match phase (lobby → question → reveal → scoreboard → podium) from the bridge.
 */
import type { VNode } from "preact";

/**
 * Render the stage page — the mount point for the `stage` island.
 *
 * @returns The stage island host section.
 * @example
 * ```tsx
 * route("/").layout(StageLayout).render(() => <StagePage />);
 * ```
 */
export function StagePage(): VNode {
  return <section data-island="stage" />;
}
