/**
 * @file The feature barrel: what the root takes from the features. Only `index.ts` and `game.ts`
 * import it; a feature imports another feature through that feature's own door, `@features/<name>`.
 */
export { matchFeature, roundFlow } from "./match";
export {
  markMinTime,
  markReady,
  recordProgress,
  splashFeature,
  splashIntro,
  splashOutro,
  splashWait
} from "./splash";
export { home, leaveHome, setLevel, stageFeature } from "./stage";
