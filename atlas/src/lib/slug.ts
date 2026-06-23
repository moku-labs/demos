/**
 * @file Human-readable id generation (#14). New issues, boards, and attachments get a `{n}-{slug}`
 * identifier — an incremental number plus a slug derived from the title/filename at creation — instead
 * of an opaque UUID, so ids read well in the URL bar and the editorial list ref column and never change
 * after creation. The number is global+monotonic over the taken ids (so the primary key stays unique),
 * and the slug is frozen from the creation-time title. The slug is ALWAYS Latin/English and kept SHORT:
 * non-Latin scripts (Cyrillic, Greek) are transliterated to ASCII so a title in any language still
 * yields a readable URL, clamped to {@link MAX_SLUG_LENGTH} on a whole-word boundary.
 */

/** Max slug length (chars) — kept short; the slug clamps on a whole-word boundary under this budget. */
const MAX_SLUG_LENGTH = 24;

/**
 * Transliteration map: non-Latin letters → their ASCII/English equivalent, so a title in another
 * language still produces a readable Latin slug (Cyrillic "Привіт" → "pryvit", Greek "Δοκιμή" →
 * "dokimi"). Keyed by the BARE lowercase letter — slugify decomposes accents (NFKD) and lowercases
 * BEFORE mapping, so precomposed forms (ї, ё, ή) arrive here as their base letter. Covers Cyrillic
 * (Ukrainian + Russian) and Greek; anything unmapped (CJK, …) is dropped by the ASCII filter, falling
 * back to "untitled" when no Latin remains.
 */
const TRANSLITERATE: Record<string, string> = {
  // ── Cyrillic (Ukrainian + Russian) ──
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
  // ── Greek ──
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o"
};

/**
 * Transliterate any mapped non-Latin letters in an (already accent-stripped, lowercased) string to
 * ASCII; unmapped characters pass through for the later ASCII filter to drop.
 *
 * @param bare - The accent-stripped, lowercased source string.
 * @returns The string with Cyrillic/Greek letters romanised.
 * @example
 * ```ts
 * transliterate("привіт"); // "pryvit"
 * ```
 */
function transliterate(bare: string): string {
  let out = "";
  for (const ch of bare) out += TRANSLITERATE[ch] ?? ch;
  return out;
}

/**
 * Clamp slug words to {@link MAX_SLUG_LENGTH} on WHOLE-WORD boundaries — keep adding words while they
 * fit; a lone first word longer than the budget is hard-sliced. Keeps slugs short and never cuts
 * mid-word (unless one word alone overflows).
 *
 * @param words - The hyphen-free slug words, in order.
 * @returns The clamped, hyphen-joined slug (empty when `words` is empty).
 * @example
 * ```ts
 * clampWords(["fix", "flaky", "websocket", "reconnect"]); // "fix-flaky-websocket"
 * ```
 */
function clampWords(words: string[]): string {
  const parts: string[] = [];
  let length = 0;
  for (const word of words) {
    const added = parts.length === 0 ? word.length : word.length + 1; // +1 for the joining hyphen
    if (parts.length > 0 && length + added > MAX_SLUG_LENGTH) break;
    parts.push(word);
    length += added;
  }
  // A lone first word can still exceed the budget — hard-clamp, then drop any trailing hyphen.
  return parts.join("-").slice(0, MAX_SLUG_LENGTH).split("-").filter(Boolean).join("-");
}

/**
 * Slugify a title/filename into a short, URL-safe, lowercase, hyphen-separated slug. Non-Latin scripts
 * are transliterated to ASCII (the slug is always English/Latin), Latin diacritics are folded, non-word
 * characters are dropped, and the result is clamped to {@link MAX_SLUG_LENGTH} on a whole-word boundary.
 * Empty / symbol-only / unmappable input yields `"untitled"` so an id is always well-formed.
 *
 * @param title - The source title or filename (any language).
 * @returns The slug (never empty).
 * @example
 * ```ts
 * slugify("Fix flaky WebSocket reconnect!"); // "fix-flaky-websocket"
 * slugify("Привіт світ"); // "pryvit-svit"
 * slugify("  ???  "); // "untitled"
 * ```
 */
export function slugify(title: string): string {
  // NFKD + strip combining marks FIRST so accents fold (é→e) and precomposed Cyrillic/Greek decompose
  // to their base letter (ї→і, ή→η) before transliteration; lowercase so the map keys match.
  const bare = title.normalize("NFKD").replaceAll(/[̀-ͯ]/g, "").toLowerCase();
  const ascii = transliterate(bare).replaceAll(/[^a-z0-9]+/g, "-"); // non-alphanumerics → one hyphen
  return clampWords(ascii.split("-").filter(Boolean)) || "untitled";
}

/**
 * Read the leading incremental number from a `{n}-{slug}` id, or 0 when the id has no numeric prefix
 * (e.g. the seed ids like `issue-ws-reconnect`).
 *
 * @param id - The id to inspect.
 * @returns The numeric prefix, or 0.
 * @example
 * ```ts
 * leadingNumber("27-fix-bug"); // 27
 * leadingNumber("issue-ws-reconnect"); // 0
 * ```
 */
function leadingNumber(id: string): number {
  const match = /^(\d+)-/.exec(id);
  return match ? Number(match[1]) : 0;
}

/**
 * Build a fresh, unique `{n}-{slug}` id from a title and the set of ids already taken. `n` is one past
 * the highest numeric prefix among the taken ids (monotonic), and is bumped further on the rare slug
 * collision so the result is always unique.
 *
 * @param title - The creation-time title/filename the slug is derived from.
 * @param takenIds - Every id already in use for this entity (the uniqueness domain).
 * @returns A unique `{n}-{slug}` id.
 * @example
 * ```ts
 * nextHumanId("Fix flaky reconnect", ["issue-ws-reconnect", "1-old"]); // "2-fix-flaky-reconnect"
 * ```
 */
export function nextHumanId(title: string, takenIds: readonly string[]): string {
  const slug = slugify(title);
  const taken = new Set(takenIds);
  let n = 1 + Math.max(0, ...takenIds.map(id => leadingNumber(id)));
  let candidate = `${n}-${slug}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${n}-${slug}`;
  }
  return candidate;
}
