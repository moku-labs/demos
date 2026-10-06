/**
 * @file The plugin barrel: the general Moku plugins of this game. They know no feature; a node asks
 * for an effect and a plugin answers it. Only `game.ts` imports it.
 */

// ─── Plugin Instances ────────────────────────────────
export { leaveExitPlugin } from "./exit";
export { loadingPlugin } from "./loading";
export { settingsLocalePlugin } from "./locale";
export { soundsPlugin } from "./ui-sounds";
