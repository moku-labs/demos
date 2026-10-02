/**
 * @file AppLayout — the page shell. It is the element that carries the iOS safe-area padding, so
 * content clears the status bar, the Dynamic Island and the home indicator inside the native shell
 * while staying a plain centred column in a browser.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";

/**
 * Frame the page in the app shell.
 *
 * @param _ctx - The route layout context.
 * @param children - The page content.
 * @returns The framed layout.
 * @example
 * ```tsx
 * route("/").layout(AppLayout).render(() => <HomePage />);
 * ```
 */
export function AppLayout(
  _ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return <main data-layout="todo">{children}</main>;
}
