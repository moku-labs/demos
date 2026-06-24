/**
 * @file Session-cookie helpers for the auth endpoints — serialize/clear the `atlas_session` cookie
 * and pull the session token off a request. Pure string helpers (no ctx/env): the `auth` plugin owns
 * the KV session lifecycle; these only shape the HTTP cookie surface the worker's auth guard reads.
 */

/** The session cookie name (mirrors `auth` config `cookieName`) — read by the worker's auth guard. */
export const SESSION_COOKIE = "atlas_session";

/**
 * Build the `Set-Cookie` value that stores a freshly minted session token as an HttpOnly, same-site
 * cookie — the worker's auth guard (`auth.isAuthed`) reads it on every later `/api/*` + `/ws/*`
 * request, so signing in is what makes the rest of the app reachable. `Secure` is intentionally
 * omitted so the cookie also works over `http://localhost` under `wrangler dev`.
 *
 * @param token - The minted session token (the KV session key).
 * @param expiresAt - The session expiry (epoch ms) — drives the cookie `Max-Age`.
 * @returns The `Set-Cookie` header value.
 * @example
 * ```ts
 * headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) }
 * ```
 */
export function sessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Build the `Set-Cookie` value that clears the session cookie (sign-out) — same attributes, zero age.
 *
 * @returns The cookie-clearing `Set-Cookie` header value.
 * @example
 * ```ts
 * headers: { "set-cookie": clearedSessionCookie() }
 * ```
 */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Extract the session token from a request: prefer `Authorization: Bearer <token>`, then fall back
 * to the `atlas_session` cookie. Used by the sign-out handler to address the KV key to delete — the
 * auth `Api` exposes only token-based `signOut`, so the endpoint resolves the token itself.
 *
 * @param request - The incoming HTTP request.
 * @returns The raw token string, or `undefined` when no token is present.
 * @example
 * ```ts
 * const token = tokenFromRequest(ctx.request);
 * if (token) await auth.signOut(env, token);
 * ```
 */
export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : undefined;
  }

  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name?.trim() === SESSION_COOKIE) {
        const value = rest.join("=").trim();
        return value.length > 0 ? value : undefined;
      }
    }
  }

  return undefined;
}
