/**
 * @file Site identity — single source of truth for the web `site` plugin (Node build + browser entry).
 */

/**
 * Site identity used by the web `site` plugin + head.
 *
 * @example
 * ```ts
 * createApp({ pluginConfigs: { site: SITE } });
 * ```
 */
export const SITE = {
  name: "Moku Todo",
  url: "http://localhost",
  author: "Moku demos",
  description: "Offline todo app — web and native from one codebase."
} as const;
