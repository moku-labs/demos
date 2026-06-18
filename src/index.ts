/**
 * @file Public surface for the Tracker app (shared domain types + site identity).
 *
 * Tracker is a deployed Layer-3 consumer app (`private`), not a published library. Its runtime
 * entries are `src/worker.ts` (Cloudflare server) and `src/app.ts` / `src/spa.tsx` (web client).
 * This barrel re-exports only the browser-safe shared types plus the `SITE` identity const so
 * tests and type-level consumers have one import, and so the scaffold's `tsdown` + `publint`/`attw`
 * pre-commit pipeline keeps a valid entry. The library build is replaced by the web `cli.build()` +
 * worker (wrangler) build in Wave 3 (see STATE.md Skeleton Revisit TODOs).
 */

export { SITE } from "./config";
export type * from "./lib/types";
