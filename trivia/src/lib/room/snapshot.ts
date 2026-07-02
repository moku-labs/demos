/**
 * @file Pure snapshot merge — casts the nine raw synced JSON cell-maps into the typed `TriviaState`
 * the islands render. No room/DOM dependency: takes a `SliceReader` (the active app's `sync.read` or
 * `controller.read`) + this device's `self` id and returns plain data, so the merge is unit-testable
 * with a fake reader. The bridge `index.ts` binds the reader to the live app; everything else is here.
 */

/* eslint-disable unicorn/no-null -- this file models the nullable JSON slice cells the host plugins
   register (e.g. `activePeer`/`phaseDeadlineTs`/`confirmed` are `null` until set); `null` is the JSON
   value, not `undefined`. Mirrors the plugins' own registerSlice nulls. */
import type { JsonValue, PeerId } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import type {
  BankView,
  CategoryAvailView,
  LanguageVoteView,
  MatchView,
  PlayerProfile,
  QuestionView,
  RevealView,
  ScoreEntry,
  StealView,
  TriviaState,
  VoteOptionView
} from "../types";

/** Reads one namespace's raw cells from the active app's replica (or `undefined` before sync). */
export type SliceReader = (ns: string) => Record<string, JsonValue> | undefined;

/** The ten synced slice namespaces the bridge subscribes to + merges. */
export const SLICES = [
  "match",
  "players",
  "question",
  "reveal",
  "steal",
  "scores",
  "bank",
  "categories",
  "offer",
  "languageVote"
] as const;

/**
 * The lobby `match` view before any host state exists.
 *
 * @returns A lobby match view.
 * @example
 * ```ts
 * const match = defaultMatch();
 * ```
 */
function defaultMatch(): MatchView {
  return {
    phase: "lobby",
    round: 1,
    activePeer: null,
    language: null,
    hostPeer: null,
    paused: false,
    phaseDeadlineTs: null,
    chosenCategory: null,
    // The unscaled base — start-game recomputes the fair scaled total (item 5).
    totalRounds: TRIVIA.rounds
  };
}

/**
 * The blank `reveal` view (read only during the reveal phase).
 *
 * @returns A blank reveal view.
 * @example
 * ```ts
 * const reveal = defaultReveal();
 * ```
 */
function defaultReveal(): RevealView {
  return {
    correctSlot: 0,
    pickedSlot: null,
    outcome: "wrong",
    scorerPeer: null,
    answerText: "",
    stealResults: [],
    answerMs: null
  };
}

/**
 * The closed `steal` view.
 *
 * @returns A closed steal view.
 * @example
 * ```ts
 * const steal = defaultSteal();
 * ```
 */
function defaultSteal(): StealView {
  return { active: false, stealPeers: [], deadlineTs: null, armedTs: null, answeredPeers: [] };
}

/**
 * The closed `languageVote` view (English leading by default — mirrors the language plugin seed).
 *
 * @returns A closed language-vote view.
 * @example
 * ```ts
 * const vote = defaultLanguageVote();
 * ```
 */
function defaultLanguageVote(): LanguageVoteView {
  return { open: false, options: [], deadlineTs: null, leading: "en", confirmed: null };
}

/**
 * The idle `bank` view (no language loaded yet).
 *
 * @returns An idle bank view.
 * @example
 * ```ts
 * const bank = defaultBank();
 * ```
 */
function defaultBank(): BankView {
  return { status: "idle", lang: null, error: null };
}

/**
 * The merged state before any app is started / synced — a pristine lobby. Used by the bridge to render
 * the very first frame (so an island never sees `undefined`) and as the `subscribe` immediate value.
 *
 * @returns A lobby `TriviaState` with empty rosters and default slice views.
 * @example
 * ```ts
 * const s = emptyState(); // s.match.phase === "lobby"
 * ```
 */
export function emptyState(): TriviaState {
  return {
    self: null,
    match: defaultMatch(),
    players: [],
    question: null,
    reveal: defaultReveal(),
    steal: defaultSteal(),
    scores: [],
    bank: defaultBank(),
    categories: [],
    offer: [],
    languageVote: defaultLanguageVote()
  };
}

/**
 * Merge the nine synced slices into the typed render state. Each cell-map is cast to its view shape
 * (the slices are plain JSON authored by the host plugins, so the cast is the typed boundary), falling
 * back to a default when a namespace has not synced yet. The `question` slice collapses to `null` when
 * blank (`id === ""`) so islands can treat "no live question" uniformly.
 *
 * @param read - Reads one namespace's raw cells (the active app's replica), or `undefined`.
 * @param self - This device's own peer id (the phone's identity; `null` on the TV display).
 * @returns The merged `TriviaState` for render.
 * @example
 * ```ts
 * const state = mergeState(ns => app.sync.read(ns), null);
 * ```
 */
export function mergeState(read: SliceReader, self: PeerId | null | undefined): TriviaState {
  const match = (read("match") as unknown as MatchView | undefined) ?? defaultMatch();

  const question = read("question") as unknown as QuestionView | undefined;
  const liveQuestion = question && question.id !== "" ? question : null;

  const players = (read("players")?.entries as unknown as PlayerProfile[] | undefined) ?? [];
  const scores = (read("scores")?.entries as unknown as ScoreEntry[] | undefined) ?? [];
  const categories =
    (read("categories")?.items as unknown as CategoryAvailView[] | undefined) ?? [];
  const offer = (read("offer")?.items as unknown as CategoryAvailView[] | undefined) ?? [];

  const languageVote =
    (read("languageVote") as unknown as LanguageVoteView | undefined) ?? defaultLanguageVote();

  const reveal = (read("reveal") as unknown as RevealView | undefined) ?? defaultReveal();
  const steal = (read("steal") as unknown as StealView | undefined) ?? defaultSteal();

  return {
    self: self ?? null,
    // Defensively default totalRounds (an older/mid-migration replica may not carry it yet).
    match: { ...match, totalRounds: match.totalRounds || TRIVIA.rounds },
    players,
    question: liveQuestion,
    // Defensively default the array cells so a slice missing them (older replica / mid-migration) never
    // crashes the reveal panel or steal strip on `.map`.
    reveal: {
      ...reveal,
      stealResults: reveal.stealResults ?? [],
      answerMs: reveal.answerMs ?? null
    },
    steal: { ...steal, answeredPeers: steal.answeredPeers ?? [], armedTs: steal.armedTs ?? null },
    scores,
    bank: (read("bank") as unknown as BankView | undefined) ?? defaultBank(),
    categories,
    offer,
    languageVote: { ...languageVote, options: (languageVote.options ?? []) as VoteOptionView[] }
  };
}
