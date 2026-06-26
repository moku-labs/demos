/**
 * @file `bun run dev` — local dev driver.
 *
 * Cold-build the web client (`dist/client`), then run the Cloudflare worker over it with `wrangler dev`
 * (the worker serves the built client through ASSETS and brokers signaling through the Hub DO).
 *
 * TODO(worker stage): regenerate `wrangler.jsonc` from `src/server.ts` before spawning wrangler, and
 * incrementally rebuild the client on change. Tracked in the build's worker-wiring step.
 */
import { app as web } from "../src/app";

await web.cli.build();

const wrangler = Bun.spawn(["bunx", "wrangler", "dev"], {
  stdio: ["inherit", "inherit", "inherit"]
});
await wrangler.exited;
