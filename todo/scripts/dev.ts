/**
 * @file `bun run dev` — local dev server (`cli.serve()`): builds, serves `dist/`, rebuilds on change
 * with live reload. No worker: this is an offline app. The native shell's `devUrl` points here.
 *
 * `--port <n>` overrides the dev port (default 4173, `pluginConfigs.cli.port` in `src/index.ts`).
 */
import { app } from "../src/index";

// Dev port comes straight from the CLI args — explicit, no hidden framework resolution.
const portFlag = process.argv.indexOf("--port");
const portValue = portFlag === -1 ? undefined : process.argv[portFlag + 1];

await app.cli.serve(portValue ? { port: Number(portValue) } : {});
