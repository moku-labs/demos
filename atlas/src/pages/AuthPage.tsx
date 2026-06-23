/**
 * @file AuthPage — the page content for the `signin` / `signup` routes (rendered into the AuthLayout's
 * `main > section`). A thin wrapper over {@link AuthForm}; the route passes the mode and the segmented
 * control's hrefs (built from the route map via `ctx.url`).
 */
import { AuthForm } from "../components/AuthForm";

/** Props for {@link AuthPage}. */
export interface AuthPageProps {
  /** Which form to show. */
  mode: "signin" | "signup";
  /** Href of the sign-in route. */
  signinHref: string;
  /** Href of the sign-up route. */
  signupHref: string;
}

/**
 * Render the auth page for the given mode.
 *
 * @param props - The auth-page props.
 * @param props.mode - Which form to show (`signin` | `signup`).
 * @param props.signinHref - Href of the sign-in route.
 * @param props.signupHref - Href of the sign-up route.
 * @returns The auth page content.
 * @example
 * ```tsx
 * route("/signin").layout(AuthLayout).render((ctx) =>
 *   <AuthPage mode="signin" signinHref={ctx.url("signin", {})} signupHref={ctx.url("signup", {})} />);
 * ```
 */
export function AuthPage({ mode, signinHref, signupHref }: AuthPageProps) {
  return <AuthForm mode={mode} signinHref={signinHref} signupHref={signupHref} />;
}
