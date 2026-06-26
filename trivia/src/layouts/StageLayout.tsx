/**
 * @file StageLayout — TV bezel chrome (placeholder). The shared-screen surface frame; the real bezel
 * (top bar B1, mute) is re-implemented from spec/design-context.md during the app-build stage.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";

/**
 * Frame the TV/stage page in the shared-screen chrome.
 *
 * @param _ctx - The route layout context.
 * @param children - The stage page, rendered into the bezel.
 * @returns The framed stage layout.
 * @example
 * ```tsx
 * route("/").layout(StageLayout).render(() => <StagePage />);
 * ```
 */
export function StageLayout(
  _ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return <div data-layout="stage">{children}</div>;
}
