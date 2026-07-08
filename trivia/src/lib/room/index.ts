/**
 * @file The web↔room bridge — a module singleton islands import (idiom I5, like tracker/lib/realtime.ts).
 * Owns the one room app this tab runs (stage XOR controller), and adapts it to the small render/intent
 * surface the islands consume. Created only in the browser (`trystero` is dynamically imported by room).
 *
 * Role split (the design's golden rule): the **TV** (`/`) runs the STAGE app — a pure shared display
 * that reads slices and sends NO intents. Each **phone** (`/code/:code`) runs the CONTROLLER app —
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
import { hardNavigate } from "@moku-labs/web/browser";
import type { EndStats } from "../../plugins/scoring/types";
import { fetchIceServers, forcedIcePolicy } from "../ice/client";
import { keepAwake } from "../keep-awake";
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
 * Controller→host intents issued BEFORE the controller finished booting + joining. The join wizard is
 * interactive from its first paint while `bootController` (ICE provisioning + `joinRoom`) is still in
 * flight, so a fast "Join" tap can outrun the boot — those intents are queued in issue order and
 * flushed the moment the join completes (dropped if it fails; the wizard's failure path owns that UX).
 * This makes delivery a structural guarantee of the bridge contract, not a timing bet on the join
 * self-heal watchdog re-sending ~10 s later.
 */
const pendingIntents: Array<{ name: IntentName; payload: JsonValue }> = [];
/** True once the controller app has started AND joined — the point queued intents can flow. */
let controllerReady = false;

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
 * The lazy ICE provider handed to room's transport (`iceServers` provider form): room invokes it at
 * `connect()` — in parallel with the signaling join — and resolves it just before the first
 * `RTCPeerConnection`. Wraps {@link fetchIceServers} so its optional `fetchImpl` test parameter never
 * leaks into the provider signature. Fail-open all the way down: `undefined` (endpoint down, no
 * secrets, timeout, garbage) keeps room's public-STUN default.
 *
 * @returns The minted ICE servers, or `undefined` to keep the transport's STUN default.
 * @example
 * ```ts
 * createStageApp(emitLifecycle, undefined, iceProvider, forcedIcePolicy());
 * ```
 */
function iceProvider(): Promise<readonly RTCIceServer[] | undefined> {
  return fetchIceServers();
}

/** Substring of the room session plugin's host-reentry localStorage keys (`moku.room.reentry.{code}`). */
const REENTRY_KEY_INFIX = ".reentry.";

/**
 * Forget any persisted host-reentry record so the next stage boot mints a FRESH room instead of
 * reclaiming the previous code. The room `session` plugin persists a host-only `HostReentryRecord` at
 * `moku.room.reentry.{code}` and restores it during `app.start()` (its `detectHostReload`), which sets
 * `role:"host"` on the OLD code — that both pins the room across reloads and makes our unconditional
 * `createRoom()` throw ("a room is already active"), blanking the lobby code/QR. This demo wants every
 * TV load to be a brand-new room, so we drop those records up front. DOM-guarded (no-op headless).
 *
 * @example
 * ```ts
 * clearHostReentry(); // then app.start() opens a fresh room
 * ```
 */
function clearHostReentry(): void {
  if (typeof localStorage === "undefined") return;
  const stale: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.includes(REENTRY_KEY_INFIX)) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
}

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
  clearHostReentry(); // every TV load = a fresh room (no stale-code reclaim, no createRoom() throw)
  // Provision the ICE relay rung (fail-open TURN credentials) via room's LAZY provider form: room
  // invokes it at connect() so the `/api/ice` fetch runs in parallel with the signaling join and is
  // resolved only at pairing time — a slow or hung endpoint can no longer delay room-open (the old
  // serial `await fetchIceServers()` cost up to ICE_FETCH_TIMEOUT_MS on this boot path). Skipped when
  // a signaling override is injected (tests pair in-process; there is no worker to ask).
  const app = createStageApp(
    emitLifecycle,
    signaling,
    signaling ? undefined : iceProvider,
    forcedIcePolicy()
  );
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
  // Hold a screen wake lock so the TV never sleeps mid-match (an OS screensaver blanks the shared screen
  // and can drop the WebRTC channels); re-acquire + re-render whenever the page returns to the foreground
  // so the game recovers itself after a sleep/visibility loss instead of staying frozen.
  keepAwake(notify);
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
  // Same lazy fail-open ICE provisioning as the stage — both sides holding relay candidates maximizes
  // pairing success on hostile NATs (CGNAT phones on LTE are the common case). Off the join critical
  // path: a hung `/api/ice` no longer widens the join race window.
  const app = createControllerApp(
    emitLifecycle,
    signaling,
    signaling ? undefined : iceProvider,
    forcedIcePolicy()
  );
  await app.start();
  controllerApp = app;
  role = "controller";
  try {
    await app.controller.joinRoom(code);
    selfId = app.session.self().selfId;
    // Keep the phone awake too, and — unlike the framework's fire-and-forget request — re-acquire the
    // lock and resync when the phone returns to the foreground (so a backgrounded phone recovers).
    keepAwake(notify);
  } catch (error) {
    // Queued pre-boot intents can never be delivered on this boot — drop them so a retry (a fresh
    // page load / re-entered wizard) starts clean instead of replaying a stale submit.
    pendingIntents.length = 0;
    emitLifecycle({
      kind: "network-warning",
      reason: error instanceof Error ? error.message : "join-failed"
    });
    throw error;
  }
  for (const ns of SLICES) app.controller.on(ns, notify);
  // Open the intent gate and flush anything the wizard submitted during boot — a fast join tap lands
  // as soon as the room is up, instead of stranding on "Joining…" until the self-heal watchdog.
  controllerReady = true;
  flushPendingIntents();
  notify();
}

/**
 * Deliver every queued pre-boot intent in issue order. Called exactly once, from `bootController`,
 * after the join succeeded (`controllerReady` is already true, so re-entrant `intent()` calls from
 * any handler these trigger go straight to the wire, not back into the queue).
 *
 * @example
 * ```ts
 * controllerReady = true;
 * flushPendingIntents();
 * ```
 */
function flushPendingIntents(): void {
  for (const item of pendingIntents.splice(0)) {
    controllerApp?.controller.intent(item.name, item.payload);
  }
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
 * never sends intents). Before the controller has booted AND joined, the intent is QUEUED and flushed
 * once the join completes — never silently dropped. (The join wizard is interactive from first paint
 * while `bootController` is still awaiting ICE provisioning / `joinRoom`, so a fast "Join" tap lands
 * here pre-boot; queueing encodes delivery in the bridge contract instead of leaning on the join
 * self-heal watchdog's ~10 s re-send.)
 *
 * @param name - The intent name.
 * @param payload - The typed payload.
 * @example
 * ```ts
 * intent("answer-lock", { slot: 1, qid: "q-abc123" });
 * ```
 */
export function intent<K extends IntentName>(name: K, payload: IntentPayload[K]): void {
  if (role === "stage") return;
  if (controllerReady && controllerApp) {
    controllerApp.controller.intent(name, payload as JsonValue);
    return;
  }
  pendingIntents.push({ name, payload: payload as JsonValue });
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
 * Build the phone join URL the lobby QR encodes — the app's own `${origin}/code/{code}` deep-link.
 *
 * This is deliberately NOT room's `stage.qr()`: room hard-codes a `${origin}?room=CODE` join URL
 * (`buildJoinUrl`), which would require the old `/?room=` → controller redirect to boot a phone. By
 * encoding our short `/code/{code}` route directly, a scanned QR lands straight on the controller with
 * no redirect, and the same short path is what players read off the TV and type at `/code`.
 *
 * @param code - The room code.
 * @returns The absolute join URL, or a relative path when there is no DOM (tests/SSR).
 * @example
 * ```ts
 * joinUrl("4F2KAB12"); // "https://trivia.play/code/4F2KAB12"
 * ```
 */
function joinUrl(code: string): string {
  const path = `/code/${code}`;
  return typeof location === "undefined" ? path : `${location.origin}${path}`;
}

/**
 * The stage QR matrix for the lobby (async; the `qrcode` encoder is lazy-imported host-only so it never
 * weighs on the controller bundle path). Encodes the app's `/code/{code}` join URL into a row-major
 * {@link QrMatrix} (`true` = dark module) that {@link QrBlock} renders as a crisp SVG. Resolves `null`
 * on a phone, before a room is open, or if encoding fails.
 *
 * @returns The QR matrix for the room's join URL, or `null`.
 * @example
 * ```ts
 * const matrix = await qr();
 * ```
 */
export async function qr(): Promise<QrMatrix | null> {
  if (role !== "stage" || !descriptor) return null;
  try {
    const { create } = await import("qrcode");
    const symbol = create(joinUrl(descriptor.code), { errorCorrectionLevel: "M" });
    const { size } = symbol.modules;
    const modules: boolean[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) modules.push(symbol.modules.get(row, col) === 1);
    }
    return { size, modules };
  } catch {
    return null;
  }
}

/**
 * Reset the TV's room: forget the persisted host-reentry record and reload with a hard navigation,
 * so the stage boots a brand-new room code + QR (the old code is invalidated; any joined phones
 * rescan). Wired to the lobby's "New code" control.
 *
 * `hardNavigate(location.href)` (from `@moku-labs/web/browser`) detaches the SPA's Navigation API
 * interceptor before reloading — without this, the framework's `onNavigate` handler sees
 * `pathWithSearch(url) === pathWithSearch(location)` (same URL reload) and converts the navigation
 * into a no-op scroll-to-top, which is why a plain `location.reload()` produced "no request, no
 * socket message". `hardNavigate` triggers a true full-page load so the module singleton
 * re-initialises, `clearHostReentry` clears any stale reentry records, and `bootStage` mints a
 * fresh room.
 *
 * No-op when there is no DOM (headless/tests).
 *
 * @example
 * ```ts
 * <button onClick={resetRoom}>New code</button>
 * ```
 */
export function resetRoom(): void {
  clearHostReentry();
  if (typeof location !== "undefined") hardNavigate(location.href);
}

/**
 * Retry a phone's connection after it drops for good (item 4 — connectivity audit): a true full-page
 * reload of the current `/code/:code` URL. Reconnect UX gap: `startController`'s boot promise is
 * memoized (idempotent by design — repeat calls from `spa.tsx`/`onMount` must be no-ops), so once a
 * join attempt has settled (resolved OR rejected) there is no in-place "try again" — the module
 * singleton has to re-initialise. `hardNavigate(location.href)` is the same true-reload primitive
 * `resetRoom` uses (see its docs for why a plain `location.reload()` doesn't work under the SPA's
 * Navigation API interceptor); re-running `onMount` re-triggers the optimistic-reconnect path (the
 * phone's persisted `{token, profile}` re-claims its seat, so a retry after a real drop is seamless,
 * not a fresh join). Wired to the phone connection-lost banner's Retry button.
 *
 * No-op when there is no DOM (headless/tests).
 *
 * @example
 * ```tsx
 * <button onClick={retryConnection}>Retry</button>
 * ```
 */
export function retryConnection(): void {
  if (typeof location !== "undefined") hardNavigate(location.href);
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
