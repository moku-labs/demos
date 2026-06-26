/**
 * @file language plugin — room-coupling handlers.
 *
 * Contains:
 * - `initLanguagePlugin` — registers the `languageVote` sync slice and the `language-vote` intent
 *   (schema + handler). Called from `onInit` in `index.ts` with deps extracted from `ctx`.
 * - `createLanguageApi` — builds the `Api` object (`openVote`/`cancelVote`/`result`).
 *   Called from the `api:` factory in `index.ts` with deps extracted from `ctx`.
 *
 * These functions accept typed deps (not a raw `ctx`) so `ctx` inference is never broken by a
 * hand-rolled context type annotation. `index.ts` passes `ctx.require(...)` results inline, so
 * TypeScript validates the call site against the real inferred ctx type.
 * @see ../index.ts
 * @see ./api.ts   — pure domain functions (recordVote, tallyVotes, buildOptions)
 * @see ./vote-timer.ts — module-closure timer singleton
 */
import type { JsonValue, PeerId, StageApi } from "@moku-labs/room";
import type { Lang } from "../../lib/types";
import { recordVote, tallyVotes } from "./api";
import type { Api, Config, State, VoteOption } from "./types";
import { armVoteTimer, clearVoteTimer, stashConfirm, takeConfirm } from "./vote-timer";

// ─── local dep shapes (derived from room source; not re-exported by @moku-labs/room) ───

/**
 * The `registerSlice` / `mutate` subset of `syncPlugin`'s API that this plugin uses.
 * Matches the non-exported `SyncApi` from `@moku-labs/room`.
 */
export type SyncDeps = {
  /** Register a new namespace with its initial cell map. */
  registerSlice(ns: string, initial: { readonly [key: string]: JsonValue }): void;
};

/**
 * The `register` / `onIntent` subset of `intentPlugin`'s API that this plugin uses.
 * Matches the non-exported `IntentApi` from `@moku-labs/room`.
 */
export type IntentDeps = {
  /** Register the correctness-only schema for one intent kind. */
  register(
    name: string,
    schema: {
      fields: Readonly<
        Record<string, { type: string; values?: readonly (string | number | boolean)[] }>
      >;
      additionalFields: boolean;
    }
  ): void;
  /** Subscribe the single handler for a registered intent kind. */
  onIntent(
    name: string,
    handler: (payload: JsonValue, meta: { readonly peerId: PeerId; readonly cSeq: number }) => void
  ): () => void;
};

// ─── init ─────────────────────────────────────────────────────────────────────

/**
 * Register the `languageVote` sync slice and the `language-vote` intent (schema + handler).
 * Call this from `onInit` in `index.ts`.
 *
 * The intent handler only processes votes while the vote gate is open (`getOpen()` returns `true`).
 * The gate is set by `openVote` (via `createLanguageApi`) and cleared on expiry/cancel/stop.
 *
 * @param sync - The `syncPlugin` API (from `ctx.require(syncPlugin)`).
 * @param intent - The `intentPlugin` API (from `ctx.require(intentPlugin)`).
 * @param stage - The `stagePlugin` API (from `ctx.require(stagePlugin)`) for `mutate`.
 * @param config - The resolved plugin config.
 * @param state - The host-internal per-peer vote map.
 * @param getOpen - Returns `true` while the vote window is open.
 * @example
 * ```ts
 * onInit: ctx => initLanguagePlugin(
 *   ctx.require(syncPlugin), ctx.require(intentPlugin), ctx.require(stagePlugin),
 *   ctx.config, ctx.state, () => _voteOpen
 * )
 * ```
 */
export const initLanguagePlugin = (
  sync: SyncDeps,
  intent: IntentDeps,
  stage: Pick<StageApi, "mutate">,
  config: Config,
  state: State,
  getOpen: () => boolean
): void => {
  // Register the `languageVote` slice with its initial (closed) shape
  sync.registerSlice("languageVote", {
    open: false,
    options: [],
    // eslint-disable-next-line unicorn/no-null -- deadlineTs is a valid JSON slice cell (null, not undefined)
    deadlineTs: null,
    leading: config.defaultLang,
    // eslint-disable-next-line unicorn/no-null -- confirmed is a valid JSON slice cell (null, not undefined)
    confirmed: null
  });

  // Register the language-vote intent schema (correctness-only shape-check)
  intent.register("language-vote", {
    fields: { lang: { type: "enum", values: config.languages } },
    additionalFields: false
  });

  // Subscribe the intent handler: tally the peer's vote and re-publish the slice
  intent.onIntent("language-vote", (payload, meta) => {
    // Guard: ignore intents while no vote is in flight
    if (!getOpen()) return;

    // Narrow the shape-validated payload (room validates before this handler runs)
    if (typeof payload !== "object" || payload === null || !("lang" in payload)) return;
    const raw = (payload as Record<string, unknown>).lang;
    if (raw !== "en" && raw !== "ru") return;
    const lang: Lang = raw;

    const { options, leading } = recordVote(
      state,
      meta.peerId,
      lang,
      config.languages,
      config.defaultLang
    );

    stage.mutate("languageVote", d =>
      (d.open as boolean | undefined)
        ? { ...d, options: options as unknown as VoteOption[], leading }
        : d
    );
  });
};

// ─── api ──────────────────────────────────────────────────────────────────────

/**
 * Build the `Api` object (`openVote` / `cancelVote` / `result`) for the language plugin.
 * Call this from the `api:` factory in `index.ts`.
 *
 * @param stage - The `stagePlugin` API (from `ctx.require(stagePlugin)`) for `mutate`.
 * @param config - The resolved plugin config.
 * @param state - The host-internal per-peer vote map.
 * @param getOpen - Returns `true` while the vote window is open.
 * @param setOpen - Sets the vote-gate (called by `openVote`/`cancelVote`/expiry).
 * @returns The `Api` object.
 * @example
 * ```ts
 * api: ctx => createLanguageApi(ctx.require(stagePlugin), ctx.config, ctx.state, () => _voteOpen, v => { _voteOpen = v; })
 * ```
 */
export const createLanguageApi = (
  stage: Pick<StageApi, "mutate">,
  config: Config,
  state: State,
  getOpen: () => boolean,
  setOpen: (open: boolean) => void
): Api => {
  /** The confirmed language once the vote window closes; `null` until then (spec: result() → Lang | null). */
  // eslint-disable-next-line unicorn/no-null -- spec: result() returns Lang | null (03-language.md)
  let confirmedLang: Lang | null = null;

  return {
    /**
     * Open the language vote: publish the slice, stash `onConfirm`, and arm the window timer.
     * Idempotent — a second call while the vote is open is a no-op.
     *
     * @param onConfirm - Called exactly once with the winning language when the window expires.
     * @example
     * ```ts
     * app.language.openVote(lang => matchFlow.advance(lang));
     * ```
     */
    openVote(onConfirm: (lang: Lang) => void): void {
      if (getOpen()) return;
      setOpen(true);

      stashConfirm(onConfirm);
      stage.mutate("languageVote", () => ({
        open: true,
        options: [],
        deadlineTs: Date.now() + config.voteWindowMs,
        leading: config.defaultLang,
        // eslint-disable-next-line unicorn/no-null -- confirmed is a valid JSON slice cell (null, not undefined)
        confirmed: null
      }));

      armVoteTimer(config.voteWindowMs, () => {
        setOpen(false);
        const winner = tallyVotes(state, config.languages, config.defaultLang);
        confirmedLang = winner;
        stage.mutate("languageVote", d => ({ ...d, open: false, confirmed: winner }));
        clearVoteTimer();
        takeConfirm()?.(winner);
      });
    },

    /**
     * Cancel the in-flight vote: clear the timer and close the slice. Idempotent.
     *
     * @example
     * ```ts
     * app.language.cancelVote();
     * ```
     */
    cancelVote(): void {
      if (!getOpen()) return;
      setOpen(false);
      clearVoteTimer();
      takeConfirm(); // discard without invoking
      stage.mutate("languageVote", d => ({ ...d, open: false }));
    },

    /**
     * Return the confirmed language, or `null` while the vote is open or before any vote.
     *
     * @returns The confirmed `Lang`, or `null`.
     * @example
     * ```ts
     * const lang = app.language.result(); // "en" | "ru" | null
     * ```
     */
    result(): Lang | null {
      return confirmedLang;
    }
  };
};
