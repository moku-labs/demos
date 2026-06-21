/**
 * @file auth plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Actor, Credentials } from "../../lib/types";

/** auth plugin configuration. */
export type Config = {
  /** Logical KV instance holding sessions (token → SessionRecord). Default "sessions". */
  sessionsKv: string;
  /** Session lifetime in seconds (KV TTL + expiry stamp). Default 86400 (24h). */
  ttlSeconds: number;
  /** Session cookie name read by isAuthed. Default "atlas_session". */
  cookieName: string;
};

/** A resolved session (returned to the client; token set as an HttpOnly cookie). */
export type Session = {
  userId: string;
  name: string;
  email: string;
  token: string;
  expiresAt: number;
};

/** Public auth API surface (env-first; demo-stub KV sessions). */
export type Api = {
  /** Demo sign-in: validate the email/password SHAPE only, mint a token, store a session. */
  signIn(env: WorkerEnv, creds: Credentials): Promise<Session>;
  /** Demo sign-up: like signIn, also records the supplied display name. */
  signUp(env: WorkerEnv, creds: Credentials): Promise<Session>;
  /** Resolve a token to its session, or null when absent/expired (defensively deletes expired keys). */
  resolveSession(env: WorkerEnv, token: string): Promise<Session | null>;
  /** Read the token from the request (cookie or Bearer header) and report whether it resolves. */
  isAuthed(request: Request, env: WorkerEnv): Promise<boolean>;
  /** Resolve the Actor (id + name) for a request, or null — used by endpoints for attribution. */
  resolveActor(request: Request, env: WorkerEnv): Promise<Actor | null>;
  /** Delete a session (sign out). Idempotent. */
  signOut(env: WorkerEnv, token: string): Promise<void>;
};

/**
 * auth plugin context: own config + cross-plugin resolver (no state, no own events).
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type AuthCtx = WorkerPluginCtx<Config, Record<string, never>, Record<never, never>> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
