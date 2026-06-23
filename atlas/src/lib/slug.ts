/**
 * @file Human-readable id generation (#14). New issues, boards, and attachments get a `{n}-{slug}`
 * identifier — an incremental number plus a slug derived from the title/filename at creation — instead
 * of an opaque UUID, so ids read well in the URL bar and the editorial list ref column and never change
 * after creation. The number is global+monotonic over the taken ids (so the primary key stays unique),
 * and the slug is frozen from the creation-time title.
 */

/** Max slug length — keeps ids and URLs tidy for long titles. */
const MAX_SLUG_LENGTH = 48;

/**
 * Slugify a title/filename into a URL-safe, lowercase, hyphen-separated slug. Diacritics are folded,
 * non-word characters dropped, runs of separators collapsed, and the result clamped to a sane length.
 * Empty/symbol-only input yields `"untitled"` so an id is always well-formed.
 *
 * @param title - The source title or filename.
 * @returns The slug (never empty).
 * @example
 * ```ts
 * slugify("Fix flaky WebSocket reconnect!"); // "fix-flaky-websocket-reconnect"
 * slugify("  ???  "); // "untitled"
 * ```
 */
export function slugify(title: string): string {
  const collapsed = title
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "") // strip combining diacritic marks
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-"); // every run of non-alphanumerics → one hyphen
  // Trim/collapse hyphens via split-filter-join (no backtracking regex), then clamp + re-trim.
  const trimmed = collapsed.split("-").filter(Boolean).join("-");
  const slug = trimmed.slice(0, MAX_SLUG_LENGTH).split("-").filter(Boolean).join("-");
  return slug || "untitled";
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
