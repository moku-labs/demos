/**
 * @file Web-client build entry — bundles the SPA to `dist/` via the web app's `cli.build()`. The
 * same `dist/` is what the native shell packages (`web.dist` in `src/native.ts`). Run via
 * `bun run build`.
 */
import { app } from "../src/index";

// No 404 page: the check guards Cloudflare Pages hosting, and this app is never hosted there.
await app.cli.build({ assertNotFound: false });
