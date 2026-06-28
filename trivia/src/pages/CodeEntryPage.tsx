/**
 * @file CodeEntryPage — the `/code` (no-code) landing content. Mounts the persistent `code-entry`
 * island host; the island renders a join-by-code box and navigates to `/code/{code}` on submit. This is
 * the human-friendly path for a phone that opens the bare `/code` link (typed or shared without a code).
 */
import type { VNode } from "preact";

/**
 * Render the code-entry page — the mount point for the `code-entry` island.
 *
 * @returns The code-entry island host section.
 * @example
 * ```tsx
 * route("/code").layout(ControllerLayout).render(() => <CodeEntryPage />);
 * ```
 */
export function CodeEntryPage(): VNode {
  return <section data-island="code-entry" />;
}
