/**
 * @file The plugin barrel: the general Moku plugins of this game. They know no feature; a node asks
 * for an effect and a plugin answers it, and what a plugin must know of the game is its config.
 * Only `index.ts` imports it.
 */

// ─── Plugin Instances ────────────────────────────────
export { exitPlugin } from "./exit";
export { loadingPlugin } from "./loading";
export { localePlugin } from "./locale";
export { uiSoundsPlugin } from "./ui-sounds";

// ─── Types ───────────────────────────────────────────
export type { LoadingConfig, RetryTrigger } from "./loading";
export type { LocalePayload } from "./locale";
export type { UiSoundsConfig } from "./ui-sounds";
