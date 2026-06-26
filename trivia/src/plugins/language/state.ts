/**
 * @file language plugin — host-internal state factory.
 * Returns an empty `Map<PeerId, Lang>` that tracks each peer's last language vote
 * (last write wins). This is host-internal state only — it never leaves the host;
 * the synced `languageVote` slice is the public face.
 */
import type { State } from "./types";

/**
 * Build the initial (empty) per-peer vote map.
 *
 * @returns An empty `Map<PeerId, Lang>` used to accumulate the in-flight votes.
 * @example
 * ```ts
 * createPlugin("language", { createState: createLanguageState });
 * ```
 */
export const createLanguageState = (): State => new Map();
