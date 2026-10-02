/**
 * @file The system-plugin composition — the one contract shared by the web app and the native app.
 * The web app reads it to know which `@moku-labs/system` capabilities exist; `src/native.ts` codegens
 * the whole native permission surface from it.
 */

/**
 * The system capabilities Moku Todo uses, by name.
 *
 * @example
 * ```ts
 * createApp({ config: { system: systemPlugins } });
 * ```
 */
export const systemPlugins = [
  { name: "store" },
  { name: "notification" },
  { name: "clipboard-manager" },
  { name: "tray" },
  { name: "deep-link" }
] as const;
