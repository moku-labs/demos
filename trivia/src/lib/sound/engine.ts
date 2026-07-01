/**
 * @file The audio engine — owns the lazily-created `AudioContext`, the master/SFX/music bus graph, the
 * two persisted mute flags (SFX and Music are independent channels — play with music, SFX, or both), the
 * gesture-unlock, and sample playback. This is the imperative surface the app calls
 * (`play`/`music`/`haptic`/`setSfxMuted`/`setMusicMuted`/`unlock`); the pure director decides *what*, the
 * reuse map decides *which sample + pitch*, this decides *how*. Browser-only and side-effect-free at
 * import (everything is behind `ensureContext`), so a headless integration test never touches
 * `AudioContext`. Excluded from unit coverage; exercised via the e2e gate.
 */
import { ASSET_IDS, assetUrl, musicUrl } from "./assets";
import { resolveHaptic } from "./haptics";
import { getBuffer, getReversed, loadBuffer } from "./loader";
import { resolveSfx } from "./map";
import type { HapticId, MusicId, PlayOptions, SfxId } from "./types";

/** localStorage keys for the two independent per-device mute channels. */
const SFX_KEY = "trivia.muted.sfx";
const MUSIC_KEY = "trivia.muted.music";
/** Pre-split single key — read as a migration fallback so an existing "muted" device stays muted. */
const LEGACY_KEY = "trivia.muted";

/** Un-muted bus levels (the mute toggles ramp each bus between its level and 0). */
const SFX_LEVEL = 0.85;
const MUSIC_LEVEL = 0.5;

/** Music crossfade duration (ms) — a bed switch fades the old out and the new in over this window. */
const MUSIC_FADE_MS = 700;

/** Lazily-built audio graph (created on first sound / unlock, never at import). */
type Graph = { ac: AudioContext; master: GainNode; sfx: GainNode; musicBus: GainNode };

let graph: Graph | undefined;
let sfxMuted: boolean | undefined;
let musicMuted: boolean | undefined;
let gestureBound = false;

/** A live music bed's playback source + its own fade gain node (between the source and the music bus). */
type BedHandle = { src: AudioBufferSourceNode; gain: GainNode };

/**
 * The bed currently looping (its own gain node carries the fade envelope), and the bed we *want* looping
 * (to ignore stale async loads).
 */
let currentBed: (BedHandle & { id: MusicId }) | undefined;
let desiredBed: MusicId | undefined;

/**
 * Read one persisted mute channel (defaults to un-muted; migrates from the pre-split single key, which
 * muted everything; tolerant of private-mode throws).
 *
 * @param key - The channel's localStorage key.
 * @returns `true` when that channel is muted.
 * @example
 * ```ts
 * readMuteFlag(SFX_KEY);
 * ```
 */
function readMuteFlag(key: string): boolean {
  try {
    const value = globalThis.localStorage?.getItem(key);
    if (value !== null && value !== undefined) return value === "1";
    return globalThis.localStorage?.getItem(LEGACY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persist one mute channel (best-effort; private-mode/quota throws are swallowed — the in-memory flag
 * still applies for the session).
 *
 * @param key - The channel's localStorage key.
 * @param value - `true` when muted.
 * @example
 * ```ts
 * persistMute(SFX_KEY, true);
 * ```
 */
function persistMute(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? "1" : "0");
  } catch {
    // Private mode / quota — the in-memory flag still applies for this session.
  }
}

/**
 * Whether SFX (and haptics) are muted (memoized read of the persisted flag).
 *
 * @returns `true` when the SFX channel is muted.
 * @example
 * ```ts
 * if (loadSfxMuted()) return;
 * ```
 */
function loadSfxMuted(): boolean {
  if (sfxMuted === undefined) sfxMuted = readMuteFlag(SFX_KEY);
  return sfxMuted;
}

/**
 * Whether the music bed is muted (memoized read of the persisted flag).
 *
 * @returns `true` when the Music channel is muted.
 * @example
 * ```ts
 * if (loadMusicMuted()) return;
 * ```
 */
function loadMusicMuted(): boolean {
  if (musicMuted === undefined) musicMuted = readMuteFlag(MUSIC_KEY);
  return musicMuted;
}

/**
 * Click-free ramp of one bus to a target gain over 80 ms (no-op before the graph exists).
 *
 * @param node - The bus gain node (`graph.sfx` / `graph.musicBus`).
 * @param target - The target gain value.
 * @example
 * ```ts
 * rampGain(graph?.sfx, 0);
 * ```
 */
function rampGain(node: GainNode | undefined, target: number): void {
  if (!graph || !node) return;
  const now = graph.ac.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(target, now + 0.08);
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
 * browsers). Graph: `sfx`/`musicBus` → `master` → destination. The master gain stays at 1; each sub-bus
 * carries its own channel mute (0 when that channel is muted), so SFX and Music are independent. Kicks off
 * a fire-and-forget preload of the small one-shot buffers so the first cues are instant.
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
  master.gain.value = 1;
  master.connect(ac.destination);

  const sfx = ac.createGain();
  sfx.gain.value = loadSfxMuted() ? 0 : SFX_LEVEL;
  sfx.connect(master);

  const musicBus = ac.createGain();
  musicBus.gain.value = loadMusicMuted() ? 0 : MUSIC_LEVEL;
  musicBus.connect(master);

  graph = { ac, master, sfx, musicBus };
  for (const id of ASSET_IDS) loadBuffer(ac, id, assetUrl(id)).catch(() => {});
  bindGestureUnlock();
  return graph;
}

/**
 * Whether the SFX channel (one-shot cues + haptics) is currently muted.
 *
 * @returns `true` when SFX is muted.
 * @example
 * ```ts
 * if (!isSfxMuted()) play("ui.tap");
 * ```
 */
export function isSfxMuted(): boolean {
  return loadSfxMuted();
}

/**
 * Whether the Music channel (the looping bed) is currently muted.
 *
 * @returns `true` when Music is muted.
 * @example
 * ```ts
 * if (!isMusicMuted()) music("bed.game", 0.5);
 * ```
 */
export function isMusicMuted(): boolean {
  return loadMusicMuted();
}

/**
 * Set + persist the SFX mute flag, ramping the SFX bus so the change is click-free. Haptics follow this
 * channel too (they are tactile "effects").
 *
 * @param next - `true` to mute SFX, `false` to un-mute.
 * @example
 * ```ts
 * setSfxMuted(true); // the TV "SFX" pill
 * ```
 */
export function setSfxMuted(next: boolean): void {
  sfxMuted = next;
  persistMute(SFX_KEY, next);
  rampGain(graph?.sfx, next ? 0 : SFX_LEVEL);
}

/**
 * Set + persist the Music mute flag, ramping the music bus click-free. Muting also stops the looping bed
 * (no point decoding inaudible music); un-muting restores the bus, and the next director cue re-starts a
 * bed.
 *
 * @param next - `true` to mute Music, `false` to un-mute.
 * @example
 * ```ts
 * setMusicMuted(true); // the TV "Music" pill
 * ```
 */
export function setMusicMuted(next: boolean): void {
  musicMuted = next;
  persistMute(MUSIC_KEY, next);
  rampGain(graph?.musicBus, next ? 0 : MUSIC_LEVEL);
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
  if (loadSfxMuted()) return;
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
 * Fade one bed's own gain node down to 0 over the crossfade window, then stop + disconnect it (via
 * `onended`). Click-free and non-blocking — used both when switching beds and on `stopMusic`.
 *
 * @param bed - The bed to fade out and tear down.
 * @param ac - The audio context (for scheduling on its clock).
 * @example
 * ```ts
 * fadeOutBed(currentBed, graph.ac);
 * ```
 */
function fadeOutBed(bed: BedHandle, ac: AudioContext): void {
  const now = ac.currentTime;
  const end = now + MUSIC_FADE_MS / 1000;
  try {
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setValueAtTime(bed.gain.gain.value, now);
    bed.gain.gain.linearRampToValueAtTime(0, end);
    bed.src.stop(end + 0.02);
  } catch {
    // Already stopped — ignore.
  }
  bed.src.addEventListener("ended", () => {
    try {
      bed.src.disconnect();
      bed.gain.disconnect();
    } catch {
      // Already disconnected — ignore.
    }
  });
}

/**
 * Start or switch the looping music bed (no-op when muted), crossfading softly between beds: the new bed
 * fades IN from silence while the old one fades OUT over {@link MUSIC_FADE_MS}, so a phase change never
 * cuts the music abruptly. Idempotent for the same id (only the intensity gain updates). The bed loads
 * asynchronously; a stale load that finishes after another switch is discarded. TV-only by construction.
 *
 * @param id - The bed to loop.
 * @param intensity - 0–1 loudness/tempo drive.
 * @example
 * ```ts
 * music("bed.game", 0.72);
 * ```
 */
export function music(id: MusicId, intensity: number): void {
  if (loadMusicMuted()) return;
  const g = ensureContext();
  if (!g) return;
  resume(g.ac);

  setMusicGain(intensity);
  if (currentBed?.id === id) return;

  desiredBed = id;
  loadBuffer(g.ac, id, musicUrl(id))
    .then(buffer => {
      if (!buffer || desiredBed !== id || !graph) return;
      const { ac, musicBus } = graph;

      // Fade the outgoing bed out (non-blocking); it stops + disconnects itself when the ramp completes.
      if (currentBed) fadeOutBed(currentBed, ac);

      // Fade the incoming bed in from silence through its own gain node (between source and the bus).
      const gain = ac.createGain();
      gain.gain.value = 0;
      gain.connect(musicBus);

      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = 1 + Math.max(0, Math.min(intensity, 1)) * 0.04;
      source.connect(gain);
      source.start();

      const now = ac.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_MS / 1000);

      currentBed = { id, src: source, gain };
    })
    .catch(() => {});
}

/**
 * Stop the music bed with a soft fade-out (rather than a hard cut).
 *
 * @example
 * ```ts
 * stopMusic();
 * ```
 */
export function stopMusic(): void {
  desiredBed = undefined;
  if (currentBed && graph) fadeOutBed(currentBed, graph.ac);
  currentBed = undefined;
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
  const pattern = resolveHaptic(id, { muted: loadSfxMuted(), supported });
  if (pattern) navigator.vibrate([...pattern]);
}
