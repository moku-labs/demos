/**
 * @file AuthLayout — the editorial split chrome for the auth gate (design context §6 A1/A2). The left
 * half is the persistent {@link AuthAside} (masthead + headline + manifesto + stats); the right half
 * is the `main > section` swap region that holds the form, so toggling Sign in ↔ Sign up swaps only
 * the right panel while the editorial aside stays put. Layout signature `(ctx, children) => VNode`,
 * used via `route(...).layout(AuthLayout)`. The wordmark link is built from the route map via `ctx.url`.
 */
import type { Router } from "@moku-labs/web/browser";
import type { ComponentChildren, VNode } from "preact";
import { AuthAside } from "../components/AuthAside";

/**
 * Frame the auth form in the editorial split (persistent aside + swappable form panel).
 *
 * @param ctx - The route layout context; its `url` builds links from the route map.
 * @param children - The auth form, rendered into the `main > section` swap region.
 * @returns The framed auth layout.
 * @example
 * ```tsx
 * route("/signin").layout(AuthLayout).render((ctx) => <SignInPage … />);
 * ```
 */
export function AuthLayout(
  ctx: Router.LayoutContext<Router.RouteState>,
  children: ComponentChildren
): VNode {
  return (
    <div data-auth-shell>
      <AuthAside homeHref={ctx.url("home", {})} />
      <main data-main>
        <section>{children}</section>
      </main>
    </div>
  );
}
