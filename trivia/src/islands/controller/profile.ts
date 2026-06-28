/**
 * @file Controller-side player-identity persistence — the phone remembers its chosen profile + a
 * stable `playerToken` per room (localStorage), so a reload re-claims the SAME seat (slot + score +
 * turn) instead of re-running the join wizard as a brand-new player. The room framework mints a fresh
 * WebRTC peerId on every (re)join, so this app-level token is the stable identity the host reconciles
 * against (see match-flow's `join-profile` handler). Best-effort: private-mode / quota errors degrade
 * to "no saved identity" (the player simply re-enters the wizard). Mirrors the `loadSeen` pattern.
 */
import type { JoinProfile } from "../../components/types";

/** localStorage key prefix — one saved identity per room code. */
const PROFILE_KEY_PREFIX = "trivia.player.";

/** A saved identity: the chosen profile plus the phone's stable per-room reconnect token. */
export type SavedIdentity = { token: string; profile: JoinProfile };

/**
 * Build the per-room localStorage key for the saved identity.
 *
 * @param code - The room code (from `/code/:code`).
 * @returns The fully-qualified localStorage key.
 * @example
 * ```ts
 * keyFor("8YFE2U2H"); // "trivia.player.8YFE2U2H"
 * ```
 */
function keyFor(code: string): string {
  return `${PROFILE_KEY_PREFIX}${code}`;
}

/**
 * Mint a stable per-room player token. Prefers `crypto.randomUUID`, but **feature-detects** it rather
 * than assuming: the design target is a plain-HTTP home LAN (CLAUDE.md — direct WebRTC, no TLS), and
 * `crypto.randomUUID` is absent in an insecure browsing context, so the timestamp fallback is the
 * EXPECTED path there, not a rare edge. The token is a per-device/per-room id, not a secret (the room
 * framework has no server-side identity check), so a non-crypto fallback is sufficient.
 *
 * @returns A freshly minted token string.
 * @example
 * ```ts
 * const token = mintToken();
 * ```
 */
function mintToken(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Insecure-context fallback (no Web Crypto): timestamp + high-res clock — unique per device/room.
  return `t-${Date.now().toString(36)}-${Math.trunc(performance.now()).toString(36)}`;
}

/**
 * Read the saved identity (profile + token) for a room, or `null` when absent/unreadable.
 *
 * @param code - The room code.
 * @returns The saved identity, or `null`.
 * @example
 * ```ts
 * const saved = loadIdentity(code);
 * if (saved) intent("join-profile", { ...saved.profile, playerToken: saved.token });
 * ```
 */
export function loadIdentity(code: string): SavedIdentity | null {
  if (!code) {
    // eslint-disable-next-line unicorn/no-null -- the controller view layer speaks `null` for "absent"
    return null;
  }
  try {
    const raw = globalThis.localStorage.getItem(keyFor(code));
    // eslint-disable-next-line unicorn/no-null -- "absent" sentinel
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JoinProfile> & { token?: unknown };
    const { token, name, avatar, color } = parsed;
    if (
      typeof token !== "string" ||
      typeof name !== "string" ||
      typeof avatar !== "string" ||
      typeof color !== "string"
    ) {
      // eslint-disable-next-line unicorn/no-null -- malformed record → treat as absent
      return null;
    }
    return { token, profile: { name, avatar, color } };
  } catch {
    // eslint-disable-next-line unicorn/no-null -- unreadable storage → treat as absent
    return null;
  }
}

/**
 * Persist the chosen profile for a room and return the stable token to send with `join-profile`.
 * Reuses an existing token for the room (so a later reconnect re-claims the same seat); mints one
 * the first time.
 *
 * @param code - The room code.
 * @param profile - The chosen name/avatar/color.
 * @returns The stable per-room player token to send as `join-profile.playerToken`.
 * @example
 * ```ts
 * const token = rememberIdentity(code, profile);
 * intent("join-profile", { ...profile, playerToken: token });
 * ```
 */
export function rememberIdentity(code: string, profile: JoinProfile): string {
  const token = loadIdentity(code)?.token ?? mintToken();
  try {
    globalThis.localStorage.setItem(keyFor(code), JSON.stringify({ token, ...profile }));
  } catch {
    // Private mode / quota — non-fatal; the host still seats the player, just no cross-reload reclaim.
  }
  return token;
}
