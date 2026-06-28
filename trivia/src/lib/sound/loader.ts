/**
 * @file Sample loader — fetch + `decodeAudioData` the MP3s into `AudioBuffer`s, cache them by key, and
 * lazily build reversed copies (a "deflate" is just a reversed "pop"). Browser-only (touches WebAudio);
 * excluded from unit coverage, exercised via the e2e gate. All buffers are tiny (≤0.5 MB) so the cache is
 * unbounded by design.
 */

/** Decoded-buffer cache, keyed by asset/bed id (reversed copies under `"{id}:rev"`). */
const cache = new Map<string, AudioBuffer>();

/**
 * Fetch + decode a sample into the cache (idempotent). Resolves the buffer, or `undefined` on any
 * network/decode failure (a missing sound must never throw into the game loop).
 *
 * @param ac - The audio context (its sample rate governs decoding).
 * @param key - Cache key (the asset/bed id).
 * @param url - The served URL to fetch.
 * @returns The decoded buffer, or `undefined` on failure.
 * @example
 * ```ts
 * await loadBuffer(ac, "tap", "/sfx/tap.mp3");
 * ```
 */
export async function loadBuffer(
  ac: AudioContext,
  key: string,
  url: string
): Promise<AudioBuffer | undefined> {
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const encoded = await response.arrayBuffer();
    const buffer = await ac.decodeAudioData(encoded);
    cache.set(key, buffer);
    return buffer;
  } catch {
    return undefined;
  }
}

/**
 * Get an already-decoded buffer (synchronous; `undefined` if not loaded yet).
 *
 * @param key - The cache key.
 * @returns The buffer, or `undefined`.
 * @example
 * ```ts
 * const buffer = getBuffer("tap");
 * ```
 */
export function getBuffer(key: string): AudioBuffer | undefined {
  return cache.get(key);
}

/**
 * Get a reversed copy of a decoded buffer, building + caching it on first use. Returns `undefined` when
 * the base buffer is not loaded yet (the caller should trigger a load and skip this play).
 *
 * @param ac - The audio context (to allocate the reversed buffer).
 * @param key - The base cache key.
 * @returns The reversed buffer, or `undefined` if the base is not loaded.
 * @example
 * ```ts
 * const deflate = getReversed(ac, "pop");
 * ```
 */
export function getReversed(ac: AudioContext, key: string): AudioBuffer | undefined {
  const revKey = `${key}:rev`;
  const existing = cache.get(revKey);
  if (existing) return existing;

  const base = cache.get(key);
  if (!base) return undefined;

  const reversed = ac.createBuffer(base.numberOfChannels, base.length, base.sampleRate);
  for (let channel = 0; channel < base.numberOfChannels; channel += 1) {
    const source = base.getChannelData(channel);
    const destination = reversed.getChannelData(channel);
    for (let index = 0, n = base.length; index < n; index += 1) {
      destination[index] = source[n - 1 - index] ?? 0;
    }
  }
  cache.set(revKey, reversed);
  return reversed;
}
