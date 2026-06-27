/**
 * @file controller island — onMount: join the room from the deep-link code, wire the snapshot
 * subscription (persisting each shown question id), the countdown ticker, and seed the host's no-repeat
 * union with this phone's history. DOM glue only — the phone reads slices + sends intents; the host is
 * authoritative.
 */
import { intent, startController, subscribe } from "../../lib/room";
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

  try {
    await startController(code);
    intent("seen-history", { ids: loadSeen() });
  } catch {
    // A failed join (full / not-found / unreachable) leaves the wizard up; the player can rescan.
  }
}
