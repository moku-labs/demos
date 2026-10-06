/**
 * @file The visual tests of the merge game on the command line (`bun run test:visual`): the
 * headless leg, then the pixel leg in Chrome with WebGPU against the dev page. The engine's runner
 * decides the pixel leg: it runs on a Mac only. When it runs, this script serves the dev page
 * itself on a free port and stops it at the end. The baselines live in `tests/visual/baselines/`.
 *
 * - `bun run test:visual` compares with the baselines.
 * - `--url <url>` uses a page that is already served instead of starting one.
 * - `--update` rewrites the baselines, `--only <name>` runs one test, `--no-pixels` the headless
 *   leg only, `--dir <path>` reads and writes the baselines in another folder.
 * - `--webgl` runs the tests with `webgl: true` on the page with `?renderer=webgl`, against their
 *   `screen.webgl.webp` baselines; `runVisualTests` reads the flag itself.
 *
 * The exit code is 1 when a checkpoint differs or a test fails.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseVisualArgv, runVisualTests } from "@moku-labs/game/visual";
import { fixtureApp } from "./fixture";
import { fixtureVisualTests } from "./tests";

/** The folder of the baselines: `<test>/<checkpoint>/`. */
const baselines = fileURLToPath(new URL("baselines/", import.meta.url));

/** The folder of the demo, where `web/serve.ts` runs from. */
const demoFolder = fileURLToPath(new URL("../../", import.meta.url));

/** A dev server this script started, and the URL it printed. */
type Served = { child: ChildProcess; url: string };

/**
 * Reads the URL after `--url`.
 *
 * @param argv - The arguments after the script.
 * @returns The URL, or `undefined` when none is given.
 */
function givenUrl(argv: readonly string[]): string | undefined {
  const at = argv.indexOf("--url");

  return at === -1 ? undefined : argv[at + 1];
}

/**
 * Starts the dev page on a free port and waits for the line that names its URL.
 *
 * @returns The server and its URL, ending in `/`.
 */
function serve(): Promise<Served> {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the Bun on PATH runs this script.
  const child = spawn("bun", ["web/serve.ts", "--port", "0"], { cwd: demoFolder });
  let printed = "";

  return new Promise((resolve, reject) => {
    const read = (chunk: Buffer): void => {
      printed += chunk.toString("utf8");
      const url = /https?:\/\/\S+\//.exec(printed)?.[0];

      if (url !== undefined) resolve({ child, url });
    };

    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("close", code => {
      reject(new Error(`web/serve.ts ended with ${code}: ${printed}`));
    });
  });
}

const argv = process.argv.slice(2);
const flags = parseVisualArgv(argv);
const url = givenUrl(argv);
const pixels = flags.pixels ?? process.platform === "darwin";
const served = pixels && url === undefined ? await serve() : undefined;
const pageUrl = url ?? served?.url;

try {
  const report = await runVisualTests(
    { app: fixtureApp, ...(pageUrl === undefined ? {} : { page: { url: pageUrl } }) },
    fixtureVisualTests,
    { dir: flags.dir ?? baselines }
  );

  process.exitCode = report.ok ? 0 : 1;
} finally {
  served?.child.kill();
}
