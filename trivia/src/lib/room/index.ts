/**
 * @file The web↔room bridge — a module singleton islands import (idiom I5, like tracker/lib/realtime.ts).
 * Owns the one room app this tab runs (stage XOR controller), and adapts it to the small render/intent
 * surface the islands consume. Created only in the browser (`trystero` is dynamically imported by room).
 *
 * Role split (the design's golden rule): the **TV** (`/`) runs the STAGE app — a pure shared display
 * that reads slices and sends NO intents. Each **phone** (`/controller/:code`) runs the CONTROLLER app —
 * a player that reads slices AND sends intents. The host clock + all authoritative game logic live in
 * the stage app's plugins; phones only mutate state by sending intents over the Wire.
 *
 * `startStage`/`startController` are idempotent (memoized boot promise) so both `spa.tsx`'s role-by-URL
 * boot and an island's `onMount` can call them — first call wins. `subscribe` fires immediately with the
 * current snapshot, then on every coalesced slice change; `snapshot` is always safe to call (pre-boot it
 * returns a pristine lobby).
 */

/* eslint-disable unicorn/no-null -- the bridge speaks the view layer's null vocabulary: `null` is
   "no active value" here (mirroring TriviaState's nullable peer/descriptor fields and the JSON slice
   cells the host plugins register as null), never `undefined`. */
import type { JsonValue, QrMatrix, RoomDescriptor, Signaling } from "@moku-labs/room";
import type { EndStats } from "../../plugins/scoring/types";
import type { IntentName, IntentPayload, PeerId, TriviaState } from "../types";
import { createControllerApp } from "./controller";
import { emptyState, mergeState, SLICES } from "./snapshot";
import { createStageApp } from "./stage";
import type { RoomLifecycle } from "./types";

// ─── Module-singleton state (one role per tab) ──────────────────────────────────

/** The live stage app, when this tab is the TV; `null` otherwise. */
let stageApp: ReturnType<typeof createStageApp> | null = null;
/** The live controller app, when this tab is a phone; `null` otherwise. */
let controllerApp: ReturnType<typeof createControllerApp> | null = null;
/** Which role booted (drives read source + whether intents are sent). */
let role: "stage" | "controller" | null = null;
/** This device's own peer id (phone identity); `null` on the TV (not a player). */
let selfId: PeerId | null = null;
/** The host room descriptor (code + joinUrl), set once the stage opens a room. */
let descriptor: RoomDescriptor | null = null;

/** In-flight boot promises (memoize so repeated start calls are no-ops). */
let stageBoot: Promise<RoomDescriptor> | null = null;
let controllerBoot: Promise<void> | null = null;

/**
 * Render subscribers (the islands) + lifecycle subscribers. The underlying per-slice subscriptions
 * live for the tab's lifetime (a singleton role never tears down), so their unsubscribers are not kept.
 */
const subscribers = new Set<(state: TriviaState) => void>();
const lifecycleSubs = new Set<(event: RoomLifecycle) => void>();

/** Coalesce a burst of slice changes into one snapshot + broadcast (microtask-batched). */
let notifyScheduled = false;

// ─── Read source + notification ─────────────────────────────────────────────────

/**
 * Read one namespace's raw cells from the active app's replica (sync on the TV, controller on a phone).
 *
 * @param ns - The slice namespace.
 * @returns The raw cell map, or `undefined` before sync / when no app is active.
 * @example
 * ```ts
 * const cells = readCells("match");
 * ```
 */
function readCells(ns: string): Record<string, JsonValue> | undefined {
  if (role === "stage" && stageApp) return stageApp.sync.read(ns);
  if (role === "controller" && controllerApp) return controllerApp.controller.read(ns);
  return undefined;
}

/**
 * Build the current merged snapshot from the active read source (a pristine lobby before any boot).
 *
 * @returns The merged render state.
 * @example
 * ```ts
 * const state = currentSnapshot();
 * ```
 */
function currentSnapshot(): TriviaState {
  if (role === null) return emptyState();
  return mergeState(readCells, selfId);
}

/**
 * Schedule one coalesced broadcast of the latest snapshot to every render subscriber (microtask-batched).
 *
 * @example
 * ```ts
 * app.sync.subscribe(ns, notify);
 * ```
 */
function notify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    const state = currentSnapshot();
    for (const fn of subscribers) fn(state);
  });
}

/**
 * Forward one `room:*` lifecycle event to every `onLifecycle` subscriber.
 *
 * @param event - The lifecycle event to forward.
 * @example
 * ```ts
 * emitLifecycle({ kind: "sync-ready" });
 * ```
 */
function emitLifecycle(event: RoomLifecycle): void {
  for (const fn of lifecycleSubs) fn(event);
}

// ─── Boot (idempotent) ──────────────────────────────────────────────────────────

/**
 * Boot the TV/stage role: start the stage app, open a room, wire slice subscriptions, and push the
 * first snapshot. Resolves with the room descriptor (code + joinUrl) for the lobby QR.
 *
 * Note: `app.sync.subscribe` fires on inbound frames from peers only — it does NOT fire when the
 * host itself calls `stage.mutate`. To keep the TV re-rendering after intent handlers mutate state,
 * we supplement the subscribe wiring with a 250 ms polling interval that calls `notify()` so the
 * StageLobby player grid (and other host-driven slices) updates on the TV immediately.
 *
 * @param signaling - Optional signaling override (tests inject a shared `inMemory()`).
 * @returns The opened room's descriptor.
 * @example
 * ```ts
 * const descriptor = await bootStage();
 * ```
 */
async function bootStage(signaling?: Signaling): Promise<RoomDescriptor> {
  const app = createStageApp(emitLifecycle, signaling);
  await app.start();
  const opened = app.stage.createRoom();
  stageApp = app;
  role = "stage";
  selfId = null;
  descriptor = opened;
  // Wire subscribe for inbound-frame notifications (peers reconnecting, resync, etc.).
  for (const ns of SLICES) app.sync.subscribe(ns, notify);
  // Poll every 250 ms so the TV re-renders when intent handlers mutate slices locally
  // (sync.subscribe does not fire for the host's own stage.mutate calls).
  setInterval(notify, 250);
  notify();
  return opened;
}

/**
 * Boot a phone/controller role: start the controller app, join the room, capture this phone's peer id,
 * request a wake lock, wire slice subscriptions, and push the first snapshot.
 *
 * @param code - The room code from the deep-link.
 * @param signaling - Optional signaling override (tests inject the shared `inMemory()`).
 * @throws {Error} If the room is full / not found / unreachable (re-thrown after a lifecycle warning).
 * @example
 * ```ts
 * await bootController("4F2KAB12");
 * ```
 */
async function bootController(code: string, signaling?: Signaling): Promise<void> {
  const app = createControllerApp(emitLifecycle, signaling);
  await app.start();
  controllerApp = app;
  role = "controller";
  try {
    await app.controller.joinRoom(code);
    selfId = app.session.self().selfId;
    app.controller.requestWakeLock().catch(() => false);
  } catch (error) {
    emitLifecycle({
      kind: "network-warning",
      reason: error instanceof Error ? error.message : "join-failed"
    });
    throw error;
  }
  for (const ns of SLICES) app.controller.on(ns, notify);
  notify();
}

/**
 * Create + start the stage app, open a room, and return its descriptor (code + joinUrl). Idempotent —
 * repeated calls return the same in-flight/opened descriptor (so both `spa.tsx` and the stage island
 * may call it).
 *
 * @param signaling - Optional signaling override; tests inject a shared `inMemory()`.
 * @returns The opened room's descriptor.
 * @example
 * ```ts
 * const { code, joinUrl } = await startStage();
 * ```
 */
export function startStage(signaling?: Signaling): Promise<RoomDescriptor> {
  if (descriptor && role === "stage") return Promise.resolve(descriptor);
  stageBoot ??= bootStage(signaling);
  return stageBoot;
}

/**
 * Create + start the controller app and join the room. Idempotent — repeated calls reuse the boot.
 *
 * @param code - The room code from the deep-link.
 * @param signaling - Optional signaling override; tests inject the shared `inMemory()`.
 * @returns A promise that resolves once joined (rejects if the room is full/not-found/unreachable).
 * @example
 * ```ts
 * await startController("4F2KAB12");
 * ```
 */
export function startController(code: string, signaling?: Signaling): Promise<void> {
  if (role === "controller" && controllerApp) return Promise.resolve();
  controllerBoot ??= bootController(code, signaling);
  return controllerBoot;
}

// ─── Render surface ─────────────────────────────────────────────────────────────

/**
 * Read the merged synced-slice state for render. Always safe to call — before any room is started it
 * returns a pristine lobby snapshot.
 *
 * @returns The merged render state.
 * @example
 * ```ts
 * const s = snapshot();
 * ```
 */
export function snapshot(): TriviaState {
  return currentSnapshot();
}

/**
 * Subscribe to any slice change; fires immediately with the current snapshot, then on every coalesced
 * change. Returns an unsubscribe.
 *
 * @param fn - Called with the merged state now and on every change.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * const off = subscribe(render);
 * ```
 */
export function subscribe(fn: (state: TriviaState) => void): () => void {
  subscribers.add(fn);
  fn(currentSnapshot());
  return () => subscribers.delete(fn);
}

/**
 * Send a controller→host intent over the Wire. A no-op on the TV (the stage is a pure display and
 * never sends intents).
 *
 * @param name - The intent name.
 * @param payload - The typed payload.
 * @example
 * ```ts
 * intent("answer-lock", { slot: 1 });
 * ```
 */
export function intent<K extends IntentName>(name: K, payload: IntentPayload[K]): void {
  if (role === "controller" && controllerApp) {
    controllerApp.controller.intent(name, payload as JsonValue);
  }
}

/**
 * Subscribe to coarse room lifecycle (`room:*` events) for transient UX (disconnect banner, pause,
 * reconnect strip); returns an unsubscribe.
 *
 * @param fn - Called on each lifecycle event.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * const off = onLifecycle(e => showBanner(e));
 * ```
 */
export function onLifecycle(fn: (event: RoomLifecycle) => void): () => void {
  lifecycleSubs.add(fn);
  return () => lifecycleSubs.delete(fn);
}

/**
 * The stage QR matrix for the lobby (async; the `qrcode` encoder is lazy-imported host-only). Resolves
 * `null` on a phone or before a room is open.
 *
 * @returns The QR matrix for the room's join URL, or `null`.
 * @example
 * ```ts
 * const matrix = await qr();
 * ```
 */
export async function qr(): Promise<QrMatrix | null> {
  if (role === "stage" && stageApp) return stageApp.stage.qr();
  return null;
}

/**
 * The host-internal end-of-match stats (most steals, highest streak, top category) for the A8 podium
 * call-out. Only the TV (stage) is the host, so this resolves `null` on a phone. Not synced — the host
 * reads its own `scoring` plugin directly.
 *
 * @returns The end-of-match stats, or `null` on a phone / before a stage app exists.
 * @example
 * ```ts
 * const { mostSteals, highestStreak } = stats() ?? {};
 * ```
 */
export function stats(): EndStats | null {
  if (role === "stage" && stageApp) return stageApp.scoring.endStats();
  return null;
}
