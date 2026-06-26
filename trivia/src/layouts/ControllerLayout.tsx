/**
 * @file ControllerLayout — phone bezel chrome (placeholder). The private-controller surface frame; the
 * real notch (B2) + modals are re-implemented from spec/design-context.md during the app-build stage.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";

/**
 * Frame the phone/controller page in the device chrome.
 *
 * @param _ctx - The route layout context.
 * @param children - The controller page, rendered into the bezel.
 * @returns The framed controller layout.
 * @example
 * ```tsx
 * route("/controller/{code}").layout(ControllerLayout).render(() => <ControllerPage />);
 * ```
 */
export function ControllerLayout(
  _ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return <div data-layout="controller">{children}</div>;
}
