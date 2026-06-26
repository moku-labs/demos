/**
 * @file controller island — the phone surface. A persistent render-island that boots the room
 * controller role (joining the room from the deep-link code), subscribes to the bridge snapshot, and
 * renders the current phase + this phone's role via {@link ControllerView}. Every player action is sent
 * to the host as an intent over the Wire. Persists each shown question id to `localStorage` and seeds the
 * host's no-repeat union via the `seen-history` intent on join.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import type { JoinProfile } from "../../components/types";
import { intent, snapshot, startController, subscribe } from "../../lib/room";
import type { CategoryId } from "../../lib/types";
import { type ControllerState, ControllerView } from "./ControllerView";

/** localStorage key for this device's cross-match no-repeat question history. */
const SEEN_KEY = "trivia.seen";

/** Read the `|`-delimited seen-question ids from localStorage (empty string when unavailable). */
function loadSeen(): string {
  try {
    return globalThis.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Append a shown question id to the persisted no-repeat history (capped, deduped; best-effort). */
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
 * Build the initial controller state (pristine snapshot; the room joins in `onMount`).
 *
 * @returns The initial controller state.
 * @example
 * ```ts
 * createIsland("controller", { state: initState });
 * ```
 */
function initState(): ControllerState {
  return {
    s: snapshot(),
    now: Date.now(),
    code: "",
    joinedProfile: null,
    lockedSlot: null,
    lockedQid: null,
    leaving: false,
    left: false
  };
}

/**
 * Join the room from the deep-link code, wire the snapshot subscription (persisting each shown question
 * id), the countdown ticker, and seed the host's no-repeat union with this phone's history.
 *
 * @param ctx - The island context (provides `params`, `set`, `cleanup`).
 * @example
 * ```ts
 * createIsland("controller", { onMount });
 * ```
 */
async function onMount(ctx: Spa.IslandContext<ControllerState>): Promise<void> {
  const code = ctx.params.code ?? "";
  ctx.set({ code });

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

/**
 * Render the phone surface, wiring each player action to a host intent.
 *
 * @param state - The current controller state.
 * @param ctx - The island context (for state updates).
 * @returns The controller view.
 * @example
 * ```ts
 * createIsland("controller", { render });
 * ```
 */
function render(
  state: Readonly<ControllerState>,
  ctx: Spa.IslandContext<ControllerState>
): Spa.RenderResult {
  return h(ControllerView, {
    state,
    onJoin: (profile: JoinProfile) => {
      intent("join-profile", profile);
      ctx.set({ joinedProfile: profile });
    },
    onStartGame: () => intent("start-game", {}),
    onVote: lang => intent("language-vote", { lang }),
    onPickCategory: (id: string) => intent("category-pick", { category: id as CategoryId }),
    onLock: (slot: number) => {
      intent("answer-lock", { slot });
      ctx.set({ lockedSlot: slot, lockedQid: state.s.question?.id ?? null });
    },
    onPlayAgain: () => intent("play-again", {}),
    onLeaveOpen: () => ctx.set({ leaving: true }),
    onStay: () => ctx.set({ leaving: false }),
    onLeave: () => ctx.set({ leaving: false, left: true })
  });
}

/** Phone controller island: joins the room, then renders the current phase + role from the bridge. */
export const controllerIsland = createIsland<ControllerState>("controller", {
  state: initState,
  onMount,
  render
});
