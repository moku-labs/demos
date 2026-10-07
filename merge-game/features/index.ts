/**
 * @file The feature barrel: what the root takes from the features — the instances `index.ts`
 * composes and the flows and nodes of the root flow in `game.ts` — then the public types of each
 * feature as a namespace. Only `index.ts` and `game.ts` import it; a feature imports another
 * feature through that feature's own door, `@features/<name>`.
 */

// ─── Feature Instances ───────────────────────────────
export { boardFeature, boardFlow } from "./board";
export { energyFeature } from "./energy";
export { dailyGift, giftFeature } from "./gift";
export { boot, home, homeFeature } from "./home";
export { hudFeature } from "./hud";
export { leaveFeature, leaveGame } from "./leave";
export { ordersFeature } from "./orders";
export { rewardFeature } from "./reward";
export { settingsFeature, settingsFlow } from "./settings";
export { loadFailed, retryLoading, setLoading, splash, splashFeature } from "./splash";

// ─── Feature Types (namespace re-exports) ────────────
export type * as Board from "./board";
export type * as Energy from "./energy";
export type * as Home from "./home";
export type * as Settings from "./settings";
export type * as Splash from "./splash";
