/**
 * @file match-flow — steal-machine adapters.
 *
 * Tiny documented bridges from the room `stage`/`scoring`/`questionBank` APIs to the pure
 * `resolveAnswer` / `handlePeerLeft` dep signatures (defined in `machine.ts`). Shared by `clock.ts`
 * (the timeout + answer-lock paths) and `handlers.ts` (the disconnect path) so the call sites pass a
 * single named adapter instead of an undocumented inline arrow.
 * @see ./machine.ts
 */
import type { PeerId, StageApi } from "@moku-labs/room";
import type { QuestionBankDeps, ScoringDeps, SyncReadDeps } from "./handlers";

/** The clock's slice reader (`ClockDeps.readSlice`): the raw cell map for a namespace, or undefined. */
export type ReadSlice = (ns: string) => Record<string, unknown> | undefined;

/**
 * Build the clock's `readSlice` adapter from the sync read API (bridges the readonly JSON cell map
 * to the clock's mutable `Record<string, unknown>` view).
 *
 * @param sync - The `syncPlugin` read API.
 * @returns A `(ns) => Record<string, unknown> | undefined` reader for the clock tick.
 * @example
 * ```ts
 * startClock({ ..., readSlice: buildReadSlice(ctx.require(syncPlugin)) });
 * ```
 */
export function buildReadSlice(sync: SyncReadDeps): ReadSlice {
  return ns => sync.read(ns) as Record<string, unknown> | undefined;
}

/** The steal machine's untyped-draft mutate signature (`resolveAnswer`'s `mutate` field). */
export type MachineMutate = (
  ns: string,
  recipe: (draft: Record<string, unknown>) => Record<string, unknown>
) => void;

/** The steal machine's award signature (`resolveAnswer`'s `award` field). */
export type MachineAward = (
  peerId: PeerId,
  opts: { correct: boolean; steal: boolean; tier: string; category: string; factor?: number }
) => void;

/** The grade signature (`handlePeerLeft`'s `grade` field). */
export type MachineGrade = (
  id: string,
  pickedSlot: number | undefined
) => { correctSlot: number; correct: boolean };

/**
 * Build the steal-machine `mutate` adapter from the stage facade. The recipe cast bridges the
 * machine's untyped-draft signature to room's typed `MutateRecipe` (room applies it to the live cells).
 *
 * @param stage - The stage facade (provides `mutate`).
 * @returns A `(ns, recipe) => void` mutate adapter for the steal machine.
 * @example
 * ```ts
 * resolveAnswer({ ..., mutate: buildMutate(stage), ... });
 * ```
 */
export function buildMutate(stage: Pick<StageApi, "mutate">): MachineMutate {
  return (ns, recipe) => stage.mutate(ns, recipe as Parameters<typeof stage.mutate>[1]);
}

/**
 * Build the steal-machine `award` adapter from the scoring API.
 *
 * @param scoring - The scoring API (provides `award`).
 * @returns A `(peerId, opts) => void` award adapter for the steal machine.
 * @example
 * ```ts
 * resolveAnswer({ ..., award: buildAward(scoring), ... });
 * ```
 */
export function buildAward(scoring: ScoringDeps): MachineAward {
  return (peerId, opts) => scoring.award(peerId, opts);
}

/**
 * Build the `grade` adapter from the question-bank API (the disconnect-timeout path).
 *
 * @param questionBank - The question-bank API (provides `grade`).
 * @returns A `(id, pickedSlot) => { correctSlot, correct }` grade adapter.
 * @example
 * ```ts
 * handlePeerLeft({ ..., grade: buildGrade(questionBank), ... });
 * ```
 */
export function buildGrade(questionBank: Pick<QuestionBankDeps, "grade">): MachineGrade {
  return (id, pickedSlot) => questionBank.grade(id, pickedSlot);
}
