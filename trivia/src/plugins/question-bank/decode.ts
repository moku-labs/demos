/**
 * @file Pure helper — decode a salted `answerCheck` to its correct slot (0–3). Anti-spoiler, not security.
 *
 * ## answerCheck format
 *
 * ```
 * answerCheck = `${salt}:${storedDigit}`
 * ```
 *
 * Where:
 * - `salt` — an arbitrary ASCII token (no colons) chosen at question-generation time. Its length is the
 *   only meaningful property used for decoding. The salt obscures the answer to a casual look at the bank
 *   JSON but provides no cryptographic security (slots are 0–3; the plaintext is trivially brute-forced).
 * - `storedDigit` — a single decimal digit `0–3` computed as:
 *   `storedDigit = (correctSlot + salt.length) % 4`
 *
 * ## Decoding
 *
 * Given an `answerCheck`, split on the LAST `:` to obtain `(salt, storedDigit)`. Then:
 * `correctSlot = (storedDigit - salt.length % 4 + 4) % 4`
 *
 * This is salt-independent in the sense that the same `correctSlot` encodes with DIFFERENT salts to
 * DIFFERENT `storedDigit` values, but each decodes back to the SAME `correctSlot`.
 *
 * ## Encoder (for /trivia-gen)
 *
 * ```ts
 * function encode(salt: string, correctSlot: number): string {
 *   return `${salt}:${(correctSlot + salt.length) % 4}`;
 * }
 * ```
 */

/**
 * Decode a salted answerCheck into the correct option slot index (0–3).
 *
 * The format is `${salt}:${storedDigit}` where
 * `storedDigit = (correctSlot + salt.length) % 4`.
 * Decoding reverses the shift: `correctSlot = (storedDigit - salt.length % 4 + 4) % 4`.
 *
 * Salt-independence: different salts encoding the same `correctSlot` all decode to the same value.
 * No runtime crypto — the sha256 question ids are precomputed by `/trivia-gen`; this transform is
 * purely anti-spoiler obfuscation.
 *
 * @param answerCheck - The obfuscated answer field from the bank JSON (format: `"${salt}:${digit}"`).
 * @returns The correct option slot index, 0–3.
 * @example
 * ```ts
 * decode("abc:3"); // → 0  (salt.length=3, stored=3, correctSlot=(3-3+4)%4=0)
 * decode("x:0");   // → 3  (salt.length=1, stored=0, correctSlot=(0-1+4)%4=3)
 * ```
 */
export function decode(answerCheck: string): number {
  // Split on the last ':' so salts containing colons are supported in theory,
  // though trivia-gen should use colon-free salts for simplicity.
  const lastColon = answerCheck.lastIndexOf(":");
  const salt = answerCheck.slice(0, lastColon);
  const storedDigit = Number.parseInt(answerCheck.slice(lastColon + 1), 10);
  return (storedDigit - (salt.length % 4) + 4) % 4;
}
