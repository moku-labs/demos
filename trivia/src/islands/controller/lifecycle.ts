/**
 * @file controller island — onMount: join the room from the deep-link code, wire the snapshot
 * subscription (persisting each shown question id), the countdown ticker, the phone's OWN connectivity
 * banner (item 4 — connectivity audit), and seed the host's no-repeat union with this phone's history.
 * DOM glue only — the phone reads slices + sends intents; the host is authoritative.
 */
import { intent, onLifecycle, startController, subscribe } from "../../lib/room";
import { startSoundDirector } from "../../lib/sound";
import { findPlayer } from "../../lib/view";
import { loadIdentity } from "./profile";
import type { ControllerContext } from "./types";

/** localStorage key for this device's cross-match no-repeat question history. */
const SEEN_KEY = "trivia.seen";

/**
 * How long the phone's connectivity banner stays in the "reconnecting…" spinner state before
 * escalating to "connection lost" (Retry button) if no `sync-ready` has arrived. Mirrors the TV
 * reconnect strip's self-heal window (D3) — a transient blip recovers silently well before this;
 * escalating past it means the drop is real and the player needs a manual nudge.
 */
const CONNECTION_LOST_MS = 8000;

/**
 * Join self-heal cadence: how often the watchdog checks whether this phone's submitted join has
 * actually landed (its seat visible in the synced `players` slice). A stranded join is re-sent from
 * the SECOND stranded tick (so the normal join path gets a full interval to land — first re-send
 * fires 5–10 s after the "You're in!" card appeared, matching the observed wedge window), then once
 * per interval up to {@link JOIN_HEAL_MAX_RESENDS}.
 */
const JOIN_HEAL_INTERVAL_MS = 5000;

/**
 * How many `join-profile` re-sends the self-heal attempts before escalating to the connection-lost
 * banner (manual Retry → reload → persisted-token reclaim — the same recovery a human performs
 * today). Bounded so a genuinely dead room degrades to actionable UX instead of silent re-sends.
 */
const JOIN_HEAL_MAX_RESENDS = 3;

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
 * Arm the join self-heal watchdog: while this phone shows the post-wizard "You're in!" card
 * (`joinedProfile` set) but its seat has NOT appeared in the synced `players` slice, re-send the
 * `join-profile` intent (idempotent — the host keys the seat on `playerToken`/peerId, and its
 * ack-beat `players.rev` bump answers even a byte-identical duplicate with a fresh delta).
 *
 * This closes the at-most-once wire gap that stranded phones on the success card: either the join
 * intent itself or the answering baseline/roster frame can be lost, and the host re-broadcasts
 * nothing until its next mutation — which, in a lobby waiting on THIS phone, may never come. After
 * {@link JOIN_HEAL_MAX_RESENDS} unanswered re-sends the watchdog escalates to the connection-lost
 * banner (manual Retry → reload → persisted-token reclaim), and un-escalates if a late frame heals
 * the join. Idle (zero work beyond one predicate read) once the seat is visible or the wizard is
 * still interactive; permanently quiet after a deliberate leave.
 *
 * @param ctx - The island context (live `state` + `set`).
 * @returns The disposer that stops the watchdog (for `ctx.cleanup`).
 * @example
 * ```ts
 * ctx.cleanup(armJoinSelfHeal(ctx));
 * ```
 */
function armJoinSelfHeal(ctx: ControllerContext): () => void {
  let strandedTicks = 0;
  let resends = 0;
  let escalated = false;

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline watchdog beat (the enclosing doc is the contract)
  const tick = (): void => {
    const { s, joinedProfile, joinToken, left } = ctx.state;
    const seated = Boolean(findPlayer(s.players, s.self));

    // Healthy / not applicable: seat landed, wizard still open, or the player deliberately left.
    if (left || joinedProfile === null || joinToken === null || seated) {
      // A late frame healed a join we had escalated on — lift our banner (a REAL ongoing outage
      // re-raises it via the network-warning path, which owns the post-sync connectivity UX).
      if (escalated && seated && ctx.state.connection === "lost") ctx.set({ connection: "ok" });
      strandedTicks = 0;
      resends = 0;
      escalated = false;
      return;
    }

    // Stranded on the "You're in!" card. Give the normal path one full interval before interfering.
    strandedTicks += 1;
    if (strandedTicks < 2) return;

    if (resends < JOIN_HEAL_MAX_RESENDS) {
      resends += 1;
      intent("join-profile", { ...joinedProfile, playerToken: joinToken });
      return;
    }

    if (!escalated) {
      escalated = true;
      ctx.set({ connection: "lost" });
    }
  };

  const timer = setInterval(tick, JOIN_HEAL_INTERVAL_MS);
  return () => clearInterval(timer);
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
  // Room codes are uppercase (room's confusable-free alphabet), so normalize the deep-link param —
  // a hand-typed or shared `/code/abc` joins the same room as `/code/ABC` (no case confusion).
  const code = (ctx.params.code ?? "").toUpperCase();
  ctx.set({ code });

  // Optimistic reconnect: if this phone already has a saved identity for THIS room, show the joined
  // state immediately (skip the wizard / mid-join modal) while the connection re-establishes. The
  // actual re-claim intent fires once the room is connected (below).
  const saved = loadIdentity(code);
  if (saved) ctx.set({ joinedProfile: saved.profile, joinToken: saved.token });

  // Fix data-layout — the server always serves the stage layout for all routes (SPA mode, no SSR).
  // On direct load to /code/:code the outer [data-layout] element has data-layout="stage"
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

  // This phone's OWN connectivity banner (item 4 — connectivity audit): a `network-warning` (a
  // dropped transport) shows the "Reconnecting…" spinner; if no `sync-ready` arrives within
  // CONNECTION_LOST_MS the banner escalates to "Connection lost" with a manual Retry — a dropped phone
  // NEVER sits silently on a stale screen. `sync-ready` clears the banner (any peer reconnecting also
  // proves the link is alive). ARMED ONLY AFTER the first `sync-ready`: transient warnings are common
  // while a join is still negotiating, and the blocking "lost" takeover must never cover the join
  // wizard (which owns its own pre-join failure/retry UX) — a real regression the lobby-new-code e2e
  // caught: the card swallowed the wizard and the phone could never join the fresh room.
  let everSynced = false;
  let lostTimer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline clear-timer helper (used by both branches below)
  const clearLostTimer = (): void => {
    if (lostTimer !== undefined) clearTimeout(lostTimer);
    lostTimer = undefined;
  };
  ctx.cleanup(
    onLifecycle(event => {
      if (event.kind === "network-warning") {
        if (!everSynced) return; // pre-join: never block the wizard with connectivity UI
        ctx.set({ connection: "reconnecting" });
        clearLostTimer();
        lostTimer = setTimeout(() => ctx.set({ connection: "lost" }), CONNECTION_LOST_MS);
      } else if (event.kind === "sync-ready" || event.kind === "peer-joined") {
        if (event.kind === "sync-ready") everSynced = true;
        clearLostTimer();
        ctx.set({ connection: "ok" });
      }
    })
  );
  ctx.cleanup(clearLostTimer);

  try {
    await startController(code);
    intent("seen-history", { ids: loadSeen() });
    // Re-claim our seat with the stable token so the host re-binds our slot/score/turn instead of
    // seating us as a new player (and so the mid-match join lock lets us — a returning player — back in).
    if (saved) intent("join-profile", { ...saved.profile, playerToken: saved.token });
    // Join self-heal (armed only once the room boot succeeded — before that, intents cannot flow and
    // the pre-join failure path below owns the UX): if the submitted join never lands in the synced
    // players slice, re-send it; escalate to the connection-lost banner when re-sends go unanswered.
    ctx.cleanup(armJoinSelfHeal(ctx));
  } catch {
    // A failed join (full / not-found / room gone after a "New code" reset / unreachable): roll back the
    // OPTIMISTIC reconnect so we don't strand the player on a fake "You're in!" card — clearing the
    // local profile drops back to the interactive wizard, where they can re-enter or rescan a fresh QR.
    // eslint-disable-next-line unicorn/no-null -- the controller view layer speaks `null` for "not joined"
    if (saved) ctx.set({ joinedProfile: null, joinToken: null });
  }
}
