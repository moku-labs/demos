/**
 * @file controller island — onMount: join the room from the deep-link code, wire the snapshot
 * subscription (persisting each shown question id), the countdown ticker, and seed the host's no-repeat
 * union with this phone's history. DOM glue only — the phone reads slices + sends intents; the host is
 * authoritative.
 */
import { intent, startController, subscribe } from "../../lib/room";
import { startSoundDirector } from "../../lib/sound";
import { loadIdentity } from "./profile";
import type { ControllerContext } from "./types";

/** localStorage key for this device's cross-match no-repeat question history. */
const SEEN_KEY = "trivia.seen";

/**
 * Read the `|`-delimited seen-question ids from localStorage (empty string when unavailable).
 *
 * @returns The persisted seen-question ids (a `|`-delimited string), or `""` when unavailable.
 * @example
 * ```ts
 * intent("seen-history", { ids: loadSeen() });
 * ```
 */
function loadSeen(): string {
  try {
    return globalThis.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Append a shown question id to the persisted no-repeat history (capped, deduped; best-effort).
 *
 * @param id - The question id to remember.
 * @example
 * ```ts
 * rememberSeen("q-abc123");
 * ```
 */
function rememberSeen(id: string): void {
  try {
    const current = loadSeen().split("|").filter(Boolean);
    if (current.includes(id)) return;
    current.push(id);
    globalThis.localStorage.setItem(SEEN_KEY, current.slice(-500).join("|"));
  } catch {
    // Private mode / quota — non-fatal; the host just sees fewer seeded ids.
  }
}

/**
 * Join the room from the deep-link code, wire the snapshot subscription (persisting each shown question
 * id), the countdown ticker, and seed the host's no-repeat union with this phone's history.
 *
 * @param ctx - The island context (provides `params`, `set`, `cleanup`).
 * @example
 * ```ts
 * createIsland("controller", { onMount: startControllerIsland });
 * ```
 */
export async function startControllerIsland(ctx: ControllerContext): Promise<void> {
  const code = ctx.params.code ?? "";
  ctx.set({ code });

  // Optimistic reconnect: if this phone already has a saved identity for THIS room, show the joined
  // state immediately (skip the wizard / mid-join modal) while the connection re-establishes. The
  // actual re-claim intent fires once the room is connected (below).
  const saved = loadIdentity(code);
  if (saved) ctx.set({ joinedProfile: saved.profile });

  // Fix data-layout — the server always serves the stage layout for all routes (SPA mode, no SSR).
  // On direct load to /controller/:code the outer [data-layout] element has data-layout="stage"
  // instead of "controller", which prevents all [data-layout="controller"] CSS from applying.
  // (The layout root is a semantic <main>, so the landmark is already correct — only the attr needs fixing.)
  const layoutElement = ctx.el.closest<HTMLElement>("[data-layout]");
  if (layoutElement && layoutElement.dataset.layout !== "controller") {
    layoutElement.dataset.layout = "controller";
  }

  ctx.cleanup(
    subscribe(s => {
      if (s.question?.id) rememberSeen(s.question.id);
      ctx.set({ s });
    })
  );

  const ticker = setInterval(() => ctx.set({ now: Date.now() }), 250);
  ctx.cleanup(() => clearInterval(ticker));

  // This phone's own sound director: reacts only to its moments (your-turn / your-steal nudges + the
  // answerer's reveal flash + haptic). Gesture SFX (tap/lock/pick/join) fire directly from the handlers.
  ctx.cleanup(startSoundDirector("controller"));

  try {
    await startController(code);
    intent("seen-history", { ids: loadSeen() });
    // Re-claim our seat with the stable token so the host re-binds our slot/score/turn instead of
    // seating us as a new player (and so the mid-match join lock lets us — a returning player — back in).
    if (saved) intent("join-profile", { ...saved.profile, playerToken: saved.token });
  } catch {
    // A failed join (full / not-found / room gone after a "New code" reset / unreachable): roll back the
    // OPTIMISTIC reconnect so we don't strand the player on a fake "You're in!" card — clearing the
    // local profile drops back to the interactive wizard, where they can re-enter or rescan a fresh QR.
    // eslint-disable-next-line unicorn/no-null -- the controller view layer speaks `null` for "not joined"
    if (saved) ctx.set({ joinedProfile: null });
  }
}
