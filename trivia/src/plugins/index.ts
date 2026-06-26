/**
 * @file Plugin barrel — the four room game plugins + their type namespaces. Spread into the stage app
 * (`src/lib/room/stage.ts`). Each plugin's instance export is paired with its type namespace (consumers
 * reach types as `QuestionBank.Config`, etc.); never `export type *` — Config/State/Api would collide.
 */
export { languagePlugin } from "./language";
export * as Language from "./language/types";
export { matchFlowPlugin } from "./match-flow";
export * as MatchFlow from "./match-flow/types";
export { questionBankPlugin } from "./question-bank";
export * as QuestionBank from "./question-bank/types";
export { scoringPlugin } from "./scoring";
export * as Scoring from "./scoring/types";
