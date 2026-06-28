/**
 * @file The audio engine — owns the lazily-created `AudioContext`, the master/SFX/music bus graph, the
 * persisted mute flag, the gesture-unlock, and sample playback. This is the imperative surface the app
 * calls (`play`/`music`/`haptic`/`setMuted`/`unlock`); the pure director decides *what*, the reuse map
 * decides *which sample + pitch*, this decides *how*. Browser-only and side-effect-free at import
 * (everything is behind `ensureContext`), so a headless integration test never touches `AudioContext`.
 * Excluded from unit coverage; exercised via the e2e gate.
 */
import { ASSET_IDS, assetUrl, musicUrl } from "./assets";
import { resolveHaptic } from "./haptics";
import { getBuffer, getReversed, loadBuffer } from "./loader";
import { resolveSfx } from "./map";
import type { HapticId, MusicId, PlayOptions, SfxId } from "./types";

/** localStorage key for the persisted mute preference (per device). */
const MUTE_KEY = "trivia.muted";

/** Lazily-built audio graph (created on first sound / unlock, never at import). */
type Graph = { ac: AudioContext; master: GainNode; sfx: GainNode; musicBus: GainNode };

let graph: Graph | undefined;
let muted: boolean | undefined;
let gestureBound = false;

/** The bed currently looping, and the bed we *want* looping (to ignore stale async loads). */
let currentBed: { id: MusicId; src: AudioBufferSourceNode } | undefined;
let desiredBed: MusicId | undefined;

/**
 * Read the persisted mute flag once (defaults to un-muted; tolerant of private-mode throws).
 *
 * @returns `true` when muted.
 * @example
 * ```ts
 * if (loadMuted()) return;
 * ```
 */
function loadMuted(): boolean {
  if (muted !== undefined) return muted;
  try {
    muted = globalThis.localStorage?.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

/**
 * Resume the context inside a user gesture (autoplay policy) — safe to call repeatedly.
 *
 * @param ac - The audio context.
 * @example
 * ```ts
 * resume(graph.ac);
 * ```
 */
function resume(ac: AudioContext): void {
  if (ac.state === "suspended") ac.resume().catch(() => {});
}

/**
 * Resume the context on the first user gesture anywhere (covers the TV, which never gets a direct tap).
 *
 * @example
 * ```ts
 * document.addEventListener("pointerdown", onGesture);
 * ```
 */
function onGesture(): void {
  if (graph) resume(graph.ac);
}

/**
 * Bind a one-time set of global gesture listeners that resume the context. No-op without a DOM.
 *
 * @example
 * ```ts
 * bindGestureUnlock();
 * ```
 */
function bindGestureUnlock(): void {
  if (gestureBound || typeof globalThis.document === "undefined") return;
  gestureBound = true;
  for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
    globalThis.document.addEventListener(type, onGesture, { passive: true });
  }
}

/**
 * Build (once) and return the audio graph, or `undefined` when WebAudio is unavailable (SSR/old
 * browsers). Graph: `sfx`/`musicBus` → `master` → destination. The master gain carries the mute (0 when
 * muted). Kicks off a fire-and-forget preload of the small one-shot buffers so the first cues are instant.
 *
 * @returns The audio graph, or `undefined` when WebAudio is unavailable.
 * @example
 * ```ts
 * const g = ensureContext();
 * if (!g) return;
 * ```
 */
function ensureContext(): Graph | undefined {
  if (graph) return graph;

  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;

  const ac = new Ctor();
  const master = ac.createGain();
  master.gain.value = loadMuted() ? 0 : 1;
  master.connect(ac.destination);

  const sfx = ac.createGain();
  sfx.gain.value = 0.85;
  sfx.connect(master);

  const musicBus = ac.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);

  graph = { ac, master, sfx, musicBus };
  for (const id of ASSET_IDS) loadBuffer(ac, id, assetUrl(id)).catch(() => {});
  bindGestureUnlock();
  return graph;
}

/**
 * Whether sound + haptics are currently muted (reads the persisted flag).
 *
 * @returns `true` when muted.
 * @example
 * ```ts
 * if (!isMuted()) play("ui.tap");
 * ```
 */
export function isMuted(): boolean {
  return loadMuted();
}

/**
 * Set + persist the mute flag, ramping the master gain so the change is click-free. Muting also stops the
 * looping bed (no point decoding inaudible music).
 *
 * @param next - `true` to mute, `false` to un-mute.
 * @example
 * ```ts
 * setMuted(true); // the TV mute pill
 * ```
 */
export function setMuted(next: boolean): void {
  muted = next;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Private mode / quota — the in-memory flag still applies for this session.
  }
  const g = graph;
  if (!g) return;
  const now = g.ac.currentTime;
  g.master.gain.cancelScheduledValues(now);
  g.master.gain.setValueAtTime(g.master.gain.value, now);
  g.master.gain.linearRampToValueAtTime(next ? 0 : 1, now + 0.08);
  if (next) stopMusic();
}

/**
 * Resume the audio context (call from a user gesture so the first sound is not swallowed by the browser
 * autoplay policy). Safe to call before any sound has played.
 *
 * @example
 * ```ts
 * onClick={() => { unlock(); play("host.start"); }}
 * ```
 */
export function unlock(): void {
  const g = ensureContext();
  if (g) resume(g.ac);
}

/**
 * Play a one-shot game cue (no-op when muted or WebAudio is unavailable). Resolves the cue to its sample
 * + static pitch/reverse/gain via the reuse map, stacks the caller's `rate`/`gain` on top, and fires a
 * one-shot `AudioBufferSourceNode`. If the sample is not decoded yet it triggers a load and skips this
 * play (the next one lands).
 *
 * @param id - The game-cue id.
 * @param opts - Optional runtime pitch (`rate`), level (`gain`), and `delayMs`.
 * @example
 * ```ts
 * play("reveal.correct", { rate: 1.12 }); // streak-pitched
 * ```
 */
export function play(id: SfxId, opts?: PlayOptions): void {
  if (loadMuted()) return;
  const g = ensureContext();
  if (!g) return;
  resume(g.ac);

  const cue = resolveSfx(id);
  const buffer = cue.reverse ? getReversed(g.ac, cue.asset) : getBuffer(cue.asset);
  if (!buffer) {
    loadBuffer(g.ac, cue.asset, assetUrl(cue.asset)).catch(() => {}); // warm the cache for next time
    return;
  }

  const source = g.ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = (cue.rate ?? 1) * (opts?.rate ?? 1);

  const level = (cue.gain ?? 1) * (opts?.gain ?? 1);
  const when = g.ac.currentTime + (opts?.delayMs ?? 0) / 1000 + 0.001;

  if (level === 1) {
    source.connect(g.sfx);
  } else {
    const gain = g.ac.createGain();
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(g.sfx);
  }
  source.start(when);
}

/**
 * Set the music-bus gain from a 0–1 intensity (the difficulty ramp).
 *
 * @param intensity - The 0–1 intensity.
 * @example
 * ```ts
 * setMusicGain(0.72);
 * ```
 */
function setMusicGain(intensity: number): void {
  if (graph) graph.musicBus.gain.value = 0.32 + Math.max(0, Math.min(intensity, 1)) * 0.28;
}

/**
 * Stop + disconnect the looping bed.
 *
 * @example
 * ```ts
 * stopBed();
 * ```
 */
function stopBed(): void {
  if (!currentBed) return;
  try {
    currentBed.src.stop();
  } catch {
    // Already stopped — ignore.
  }
  currentBed.src.disconnect();
  currentBed = undefined;
}

/**
 * Start or switch the looping music bed (no-op when muted). Idempotent for the same id (only the
 * intensity gain updates). The bed loads asynchronously; a stale load that finishes after another switch
 * is discarded. TV-only by construction — the director never emits music cues on the phone surface.
 *
 * @param id - The bed to loop.
 * @param intensity - 0–1 loudness/tempo drive.
 * @example
 * ```ts
 * music("bed.game", 0.72);
 * ```
 */
export function music(id: MusicId, intensity: number): void {
  if (loadMuted()) return;
  const g = ensureContext();
  if (!g) return;
  resume(g.ac);

  setMusicGain(intensity);
  if (currentBed?.id === id) return;

  desiredBed = id;
  loadBuffer(g.ac, id, musicUrl(id))
    .then(buffer => {
      if (!buffer || desiredBed !== id || !graph) return;
      stopBed();
      const source = graph.ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = 1 + Math.max(0, Math.min(intensity, 1)) * 0.04;
      source.connect(graph.musicBus);
      source.start();
      currentBed = { id, src: source };
    })
    .catch(() => {});
}

/**
 * Stop the music bed.
 *
 * @example
 * ```ts
 * stopMusic();
 * ```
 */
export function stopMusic(): void {
  desiredBed = undefined;
  stopBed();
}

/**
 * Fire a phone haptic (no-op when muted or unsupported — e.g. iOS Safari). Pure pattern resolution lives
 * in {@link resolveHaptic}; this gates on the live `navigator` and fires.
 *
 * @param id - The haptic id.
 * @example
 * ```ts
 * haptic("correct");
 * ```
 */
export function haptic(id: HapticId): void {
  if (typeof navigator === "undefined") return;
  const supported = typeof navigator.vibrate === "function";
  const pattern = resolveHaptic(id, { muted: loadMuted(), supported });
  if (pattern) navigator.vibrate([...pattern]);
}
