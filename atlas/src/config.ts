/**
 * @file SITE identity constants — single source of truth (web Rule R4).
 */

/** Site identity used by the web `site` plugin and head/SEO. */
export const SITE = {
  name: "Atlas",
  url: "https://atlas.example.dev",
  author: "Atlas demo",
  description: "An editorial issue tracker — the Moku composition showcase."
} as const;
