/**
 * @file AuthForm — the right half of the auth split (design context §6 A1/A2). One component, two
 * modes: `signin` ("Welcome back" — email + password, Remember me, Forgot password) and `signup`
 * ("Open an account" — name + email + password + confirm + Terms). The Sign in / Sign up segmented
 * control links the two routes (hrefs from the route map, passed in). The form is a
 * `[data-island="auth"]` mount; the Phase-C auth island intercepts submit and posts to
 * `/api/auth/*` — the markup degrades to a real POST with no JS. Any valid-looking details work
 * (demo auth).
 */
import { Icon } from "./Icon";

/** Props for {@link AuthForm}. */
export interface AuthFormProps {
  /** Which form to render. */
  mode: "signin" | "signup";
  /** Href of the sign-in route (for the segmented control). */
  signinHref: string;
  /** Href of the sign-up route (for the segmented control). */
  signupHref: string;
}

/**
 * Render the auth form for the given mode, with the route-linked segmented control.
 *
 * @param props - The auth-form props.
 * @param props.mode - Which form to render (`signin` | `signup`).
 * @param props.signinHref - Href of the sign-in route.
 * @param props.signupHref - Href of the sign-up route.
 * @returns The auth form element.
 * @example
 * ```tsx
 * <AuthForm mode="signin" signinHref={ctx.url("signin", {})} signupHref={ctx.url("signup", {})} />
 * ```
 */
export function AuthForm({ mode, signinHref, signupHref }: AuthFormProps) {
  const isSignup = mode === "signup";
  return (
    <div data-auth-panel>
      <nav data-auth-switch aria-label="Sign in or sign up">
        <a href={signinHref} data-seg data-active={isSignup ? undefined : ""}>
          Sign in
        </a>
        <a href={signupHref} data-seg data-active={isSignup ? "" : undefined}>
          Sign up
        </a>
      </nav>

      <form
        data-island="auth"
        data-mode={mode}
        method="post"
        action={isSignup ? "/api/auth/signup" : "/api/auth/signin"}
        novalidate
      >
        <h2 data-auth-title>{isSignup ? "Open an account" : "Welcome back"}</h2>

        {isSignup && (
          <label data-field>
            <span data-field-label>Name</span>
            <input
              type="text"
              name="name"
              autocomplete="name"
              placeholder="Ada Lovelace"
              required
            />
          </label>
        )}

        <label data-field>
          <span data-field-label>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="email"
            placeholder="you@studio.dev"
            required
          />
        </label>

        <label data-field>
          <span data-field-label>Password</span>
          <input
            type="password"
            name="password"
            autocomplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            required
          />
        </label>

        {isSignup ? (
          <label data-field>
            <span data-field-label>Confirm password</span>
            <input
              type="password"
              name="confirm"
              autocomplete="new-password"
              placeholder="••••••••"
              required
            />
          </label>
        ) : (
          <div data-field-row>
            <label data-remember>
              <input type="checkbox" name="remember" />
              <span>Remember me</span>
            </label>
            <a href="/signin" data-forgot>
              Forgot password?
            </a>
          </div>
        )}

        <p data-auth-error data-island="auth-error" hidden />

        <button type="submit" data-auth-submit>
          {isSignup ? "Create account" : "Sign in"}
        </button>

        {isSignup && (
          <p data-auth-terms>
            By creating an account you agree to the Atlas <a href="/signup">Terms</a> and{" "}
            <a href="/signup">Privacy</a> — a demo, so nothing is really stored.
          </p>
        )}

        <div data-auth-divider>
          <span>or continue with</span>
        </div>

        <div data-auth-social>
          <button type="button" data-social="google">
            <Icon name="google" />
            <span>Google</span>
          </button>
          <button type="button" data-social="apple">
            <Icon name="apple" />
            <span>Apple</span>
          </button>
        </div>
      </form>
    </div>
  );
}
