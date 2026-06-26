/**
 * @file language plugin — default configuration.
 *
 * The `DEFAULT_CONFIG` constant is typed against `Config` so any missing or extra key is caught
 * at compile-time. Extracted from `index.ts` to keep the wiring file within the 30-line budget.
 */
import type { Config } from "./types";

/**
 * Default language plugin config.
 *
 * - `languages`: `["en", "ru"]` — English and Russian are always available.
 * - `voteWindowMs`: `5000` — 5-second vote window ("Confirming in 5…4…3…" countdown).
 * - `defaultLang`: `"en"` — English wins on a tie or with zero votes.
 *
 * @example
 * ```ts
 * import { DEFAULT_CONFIG } from "./config";
 * // override in tests via pluginConfigs: { language: { voteWindowMs: 200 } }
 * ```
 */
export const DEFAULT_CONFIG: Config = {
  languages: ["en", "ru"],
  voteWindowMs: 5000,
  defaultLang: "en"
};
