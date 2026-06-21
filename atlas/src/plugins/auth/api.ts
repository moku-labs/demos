/* eslint-disable unicorn/no-null -- null is the KV contract (absent keys) and the public Api return type (Session|null, Actor|null) */
/**
 * @file auth plugin — API factory (demo-stub KV session gate).
 *
 * All credential validation is FORMAT-ONLY (demo stub — any valid-looking value succeeds).
 * Tokens are crypto.randomUUID() opaques stored in the `sessions` KV namespace with a
 * server-side TTL. userId is a SHA-256 hash of the lowercased email — never the raw email.
 */
import { kvPlugin } from "@moku-labs/worker";
import type { Actor } from "../../lib/types";
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
import type { Api, AuthCtx, Session } from "./types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** The env-first key/value surface for the sessions namespace (alias of KvNamespaceApi). */
type SessionsNs = {
  get(env: Parameters<Api["signIn"]>[0], key: string): Promise<string | null>;
  put(
    env: Parameters<Api["signIn"]>[0],
    key: string,
    value: string,
    opts?: { expirationTtl?: number }
  ): Promise<void>;
  delete(env: Parameters<Api["signIn"]>[0], key: string): Promise<void>;
};

/** The shape persisted in KV (keyed by token). Token is NOT stored — it is the key. */
type SessionRecord = {
  userId: string;
  name: string;
  email: string;
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Private helpers (module-scoped, not exported)
// ---------------------------------------------------------------------------

/**
 * Return true when the string looks like an email address (shape only, not RFC 5321).
 * Uses a possessive-style character-class pattern to avoid catastrophic backtracking.
 *
 * @param email - The candidate email string.
 * @returns True when the string matches a basic `local@domain.tld` pattern.
 * @example
 * ```ts
 * isValidEmail("alice@example.com"); // true
 * isValidEmail("not-an-email");      // false
 * ```
 */
// eslint-disable-next-line sonarjs/slow-regex -- character-class alternation only; no nested quantifiers; linear runtime
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Return true when the password is non-empty after trimming.
 *
 * @param password - The candidate password string.
 * @returns True when the trimmed password has length > 0.
 * @example
 * ```ts
 * isValidPassword("secret"); // true
 * isValidPassword("  ");     // false
 * ```
 */
const isValidPassword = (password: string): boolean => password.trim().length > 0;

/**
 * Derive a stable, opaque user id from an email address using SHA-256.
 * The id is prefixed with `u_` and uses 16 hex characters of the digest.
 *
 * @param email - The email to hash (lowercased before hashing for case-insensitivity).
 * @returns A stable, PII-free user id string.
 * @example
 * ```ts
 * const id = await deriveUserId("Alice@Example.com"); // "u_2a5f8b3d..."
 * ```
 */
const deriveUserId = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hexChars = [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `u_${hexChars.slice(0, 16)}`;
};

/**
 * Extract the local part of an email address (the part before `@`).
 *
 * @param email - A valid email address.
 * @returns The local part, or the full string if `@` is absent.
 * @example
 * ```ts
 * emailLocalPart("alice@example.com"); // "alice"
 * ```
 */
const emailLocalPart = (email: string): string => email.split("@")[0] ?? email;

/**
 * Extract the session token from a `Request`'s headers.
 * Prefers `Authorization: Bearer <token>`; falls back to the named session cookie.
 *
 * @param request - The incoming HTTP request.
 * @param cookieName - The name of the session cookie to look for.
 * @returns The raw token string, or null when absent.
 * @example
 * ```ts
 * const token = tokenFromRequest(req, "atlas_session");
 * ```
 */
const tokenFromRequest = (request: Request, cookieName: string): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name?.trim() === cookieName) {
        const value = rest.join("=").trim();
        return value.length > 0 ? value : null;
      }
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// API factory
// ---------------------------------------------------------------------------

/**
 * Creates the auth API surface for the Atlas demo-stub KV session gate.
 *
 * Credential validation is FORMAT-ONLY — any valid-looking email + non-empty password
 * succeeds. Tokens are `crypto.randomUUID()` opaques stored in the `sessions` KV
 * namespace with a server-side TTL. userId is a stable SHA-256 hash of the lowercased
 * email (prefixed `u_`), never the raw email.
 *
 * @param ctx - The auth plugin context (config + `require` for kvPlugin).
 * @returns The six-method auth API: `signIn`, `signUp`, `resolveSession`, `isAuthed`,
 *   `resolveActor`, and `signOut`.
 * @example
 * ```ts
 * export const authPlugin = createPlugin("auth", { api: ctx => createAuthApi(ctx) });
 * ```
 */
export function createAuthApi(ctx: AuthCtx): Api {
  /**
   * Return the KV namespace api for the sessions namespace.
   * Resolved lazily per call so each request gets the per-request env threaded in.
   *
   * @returns The sessions KV namespace api.
   * @example
   * ```ts
   * await sessions().put(env, token, json, { expirationTtl: 86400 });
   * ```
   */
  const sessions = (): SessionsNs => ctx.require(kvPlugin).use(ctx.config.sessionsKv);

  /**
   * Mint a new session, write it to KV, and return the full Session object.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param email - The validated email address.
   * @param name - The display name to store.
   * @returns The minted Session.
   * @example
   * ```ts
   * const session = await mintSession(env, "alice@example.com", "Alice");
   * ```
   */
  const mintSession = async (
    env: Parameters<Api["signIn"]>[0],
    email: string,
    name: string
  ): Promise<Session> => {
    const userId = await deriveUserId(email);
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + ctx.config.ttlSeconds * 1000;
    const record: SessionRecord = { userId, name, email, expiresAt };
    await sessions().put(env, token, JSON.stringify(record), {
      expirationTtl: ctx.config.ttlSeconds
    });
    return { userId, name, email, token, expiresAt };
  };

  /**
   * Resolve a token to its Session, or null when absent, malformed, or expired.
   *
   * Closed over (not a `this`-bound method) so callers can pass it by reference — `isAuthed`
   * and `resolveActor` invoke it directly. Defensively deletes the KV key when its value is
   * unparseable or past its `expiresAt` stamp, so a poisoned key can never crash the auth guard
   * (a thrown `SyntaxError` would surface as a 500 instead of a fail-closed 401).
   *
   * @param env - Per-request Cloudflare bindings.
   * @param token - The opaque session token.
   * @returns The Session, or null when absent/malformed/expired.
   * @example
   * ```ts
   * const session = await resolveSession(env, token);
   * ```
   */
  const resolveSession = async (
    env: Parameters<Api["signIn"]>[0],
    token: string
  ): Promise<Session | null> => {
    if (!token) return null;
    const raw = await sessions().get(env, token);
    if (raw === null) return null;
    let record: SessionRecord;
    try {
      record = JSON.parse(raw) as SessionRecord;
    } catch {
      await sessions().delete(env, token);
      return null;
    }
    if (typeof record.expiresAt !== "number" || record.expiresAt <= Date.now()) {
      await sessions().delete(env, token);
      return null;
    }
    return { ...record, token };
  };

  return {
    /**
     * Demo sign-in: validate the email/password SHAPE only, mint a token, store a session.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param creds - `{ email, password, name? }` — name is ignored on sign-in.
     * @returns The minted Session including the opaque token.
     * @throws {Error} When the email shape or password is invalid.
     * @example
     * ```ts
     * const session = await app.auth.signIn(env, { email: "a@b.com", password: "pw" });
     * ```
     */
    async signIn(env, creds) {
      if (!isValidEmail(creds.email)) {
        throw new Error("[atlas-auth] Invalid email format.\n  Provide a valid email address.");
      }
      if (!isValidPassword(creds.password)) {
        throw new Error("[atlas-auth] Invalid password.\n  Password must be non-empty.");
      }
      const name = creds.name?.trim() || emailLocalPart(creds.email);
      return mintSession(env, creds.email, name);
    },

    /**
     * Demo sign-up: like signIn, but records the supplied display name.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param creds - `{ email, password, name? }` — name is stored as the display name.
     * @returns The minted Session including the opaque token.
     * @throws {Error} When the email shape or password is invalid.
     * @example
     * ```ts
     * const session = await app.auth.signUp(env, { email: "a@b.com", password: "pw", name: "Alice" });
     * ```
     */
    async signUp(env, creds) {
      if (!isValidEmail(creds.email)) {
        throw new Error("[atlas-auth] Invalid email format.\n  Provide a valid email address.");
      }
      if (!isValidPassword(creds.password)) {
        throw new Error("[atlas-auth] Invalid password.\n  Password must be non-empty.");
      }
      const name = creds.name?.trim() || emailLocalPart(creds.email);
      return mintSession(env, creds.email, name);
    },

    /**
     * Resolve a token to its Session, or null when absent or expired.
     * Defensively deletes expired KV keys when encountered.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param token - The opaque session token.
     * @returns The Session, or null when absent/expired.
     * @example
     * ```ts
     * const session = await app.auth.resolveSession(env, token);
     * if (!session) return new Response("Unauthorized", { status: 401 });
     * ```
     */
    resolveSession,

    /**
     * Read the token from the request (cookie or Bearer header) and report whether it resolves.
     *
     * @param request - The incoming HTTP request.
     * @param env - Per-request Cloudflare bindings.
     * @returns True when the request carries a valid, unexpired session token.
     * @example
     * ```ts
     * if (!(await app.auth.isAuthed(request, env))) {
     *   return new Response("Unauthorized", { status: 401 });
     * }
     * ```
     */
    async isAuthed(request, env) {
      const token = tokenFromRequest(request, ctx.config.cookieName);
      if (!token) return false;
      const session = await resolveSession(env, token);
      return session !== null;
    },

    /**
     * Resolve the Actor (id + name) for a request, or null when unauthenticated.
     * Used by endpoints for attribution.
     *
     * @param request - The incoming HTTP request.
     * @param env - Per-request Cloudflare bindings.
     * @returns The Actor `{ id, name }`, or null.
     * @example
     * ```ts
     * const actor = await app.auth.resolveActor(request, env);
     * if (!actor) return new Response("Unauthorized", { status: 401 });
     * ```
     */
    async resolveActor(request, env): Promise<Actor | null> {
      const token = tokenFromRequest(request, ctx.config.cookieName);
      if (!token) return null;
      const session = await resolveSession(env, token);
      if (!session) return null;
      return { id: session.userId, name: session.name };
    },

    /**
     * Delete a session (sign out). Idempotent — deleting an absent key is a no-op.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param token - The opaque session token to invalidate.
     * @returns Resolves once the key is deleted.
     * @example
     * ```ts
     * await app.auth.signOut(env, token);
     * ```
     */
    async signOut(env, token) {
      await sessions().delete(env, token);
    }
  };
}
