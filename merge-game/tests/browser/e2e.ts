/**
 * @file Runs the editor's Playwright specs (`bun run test:editor:e2e`): one Playwright process,
 * so one fresh editor bin, per project of the config. Bun 1.3.14's dev server crashes after the
 * hot reloads of all four projects in one process. Each bin gets its own port (`PORT`, else 4417,
 * plus the project's index), because the bin of the previous project can still hold its port for
 * a moment after Playwright stops it.
 *
 * An explicit `--project` runs once as given. Other arguments go to Playwright:
 * `bun run test:editor:e2e --project chromium-desktop -g pick`. In CI (`CI=true`) the Chromium
 * of `@playwright/test` is installed first. The exit code is the first that failed, else 0.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EDITOR_E2E_PROJECTS } from "./playwright.config";

/** The demo folder: Playwright runs there. */
const DEMO = fileURLToPath(new URL("../../", import.meta.url));

/** The Playwright config of the specs, from the demo folder. */
const CONFIG = "tests/browser/playwright.config.ts";

/**
 * Runs `bun x <args>` in the demo folder with the terminal attached, and waits for it.
 *
 * @param args - The arguments after `bun x`, such as `["playwright", "test"]`.
 * @param env - Variables added to this process's environment.
 * @returns The exit code.
 */
function bunx(args: readonly string[], env: Record<string, string> = {}): Promise<number> {
  return new Promise(resolve => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the Bun on PATH runs this script.
    const child = spawn("bun", ["x", ...args], {
      cwd: DEMO,
      stdio: "inherit",
      env: { ...process.env, ...env }
    });

    child.on("close", code => resolve(code ?? 1));
  });
}

/**
 * Runs the specs: once as given with `--project`, else once per project on its own port.
 *
 * @param rest - The arguments for Playwright.
 * @returns The exit code: the first that failed, else 0.
 */
async function runSpecs(rest: readonly string[]): Promise<number> {
  const playwright = (args: readonly string[], env?: Record<string, string>): Promise<number> =>
    bunx(["playwright", "test", "-c", CONFIG, ...args], env);

  if (rest.some(arg => arg.startsWith("--project"))) return playwright(rest);

  const port = Number(process.env.PORT ?? 4417);
  let failed = 0;
  for (const [index, project] of EDITOR_E2E_PROJECTS.entries()) {
    const code = await playwright(["--project", project, ...rest], { PORT: String(port + index) });
    if (failed === 0) failed = code;
  }

  return failed;
}

const installed = process.env.CI === "true" ? await bunx(["playwright", "install", "chromium"]) : 0;

process.exitCode = installed === 0 ? await runSpecs(process.argv.slice(2)) : installed;
