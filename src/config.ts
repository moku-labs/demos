/**
 * @file SITE identity constants — single source of truth (web Rule R4).
 */

/** Site identity used by the web `site` plugin and head/SEO. */
export const SITE = {
  name: "Tracker",
  url: "https://tracker.example.dev",
  author: "Tracker demo",
  description: "A real-time kanban demo that proves @moku-labs/worker."
} as const;
