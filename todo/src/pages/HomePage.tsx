/**
 * @file HomePage — the only page. It is the mount point for the `todo-app` island; everything on
 * screen is rendered by that island once it has booted the system app.
 */
import type { VNode } from "preact";

/**
 * Render the home page — the island host.
 *
 * @returns The `todo-app` island host section.
 * @example
 * ```tsx
 * route("/").layout(AppLayout).render(() => <HomePage />);
 * ```
 */
export function HomePage(): VNode {
  return <section data-island="todo-app" />;
}
