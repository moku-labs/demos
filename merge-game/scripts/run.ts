/**
 * @file The one runner of the demo: every script of package.json goes through it, so each one
 * takes the same engine and editor inputs. It lives in this demo because demos share no root
 * code; it moves into the engine CLI later.
 *
 * `bun scripts/run.ts <command> [--engine <x>] [--editor <x>] [...rest]`, where `<x>` is:
 *
 * - nothing: what package.json pins.
 * - a version (`0.8.0`) or a pkg.pr.new URL: installed for this run. Locally package.json and
 *   bun.lock are put back afterwards; in CI (`CI=true`) they stay.
 * - a path to a working tree: the engine runs from its `src/` (vitest alias, Bun preload, dev page
 *   plugin and a generated tsconfig under `.moku/`); the editor runs its built bin from there, and
 *   the editor scenarios import its built entries (vitest alias, dev page plugin).
 *
 * `MOKU_ENGINE` and `MOKU_EDITOR` give the same inputs when the flags are left out. The rest of
 * the arguments go to the command: `bun run test:visual --no-pixels`, `bun run dev --port 0`. For
 * `test:editor` they go to Playwright: `bun run test:editor --project chromium-desktop -g pick`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createBrandConsole } from "@moku-labs/common/cli";
import { demoRoot, EDITOR_ROOT_ENV, ENGINE_SRC_ENV, engineEntries, entrySource } from "./engine";

/** Where an engine or an editor comes from for one run. */
type Source = { kind: "pin" } | { kind: "package"; spec: string } | { kind: "path"; root: string };

/** The command line, read. */
type Invocation = { command: string; engine: Source; editor: Source; rest: string[] };

/** One package a run installs over its pin: the section of package.json and the spec. */
type Override = { name: string; section: "dependencies" | "devDependencies"; spec: string };

/** The package.json of the demo, as far as the runner reads it. */
type DemoManifest = Record<"dependencies" | "devDependencies", Record<string, string>>;

/** The commands of the runner, each one a script of package.json. */
const COMMANDS = [
  "dev",
  "editor",
  "test",
  "test:visual",
  "test:editor",
  "typecheck",
  "pack",
  "build"
];

/** The Playwright config of the editor e2e specs of `test:editor`. */
const EDITOR_E2E_CONFIG = "tests/editor/e2e/playwright.config.ts";

const ui = createBrandConsole();

/**
 * Takes the value after a flag out of the arguments.
 *
 * @param argv - The arguments; the flag and its value are removed from it.
 * @param flag - The flag, such as `--engine`.
 * @returns The value, or `undefined` when the flag is not there.
 * @throws {Error} When the flag has no value.
 */
function takeFlag(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);

  if (at === -1) return undefined;

  const value = argv[at + 1];

  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.`);

  argv.splice(at, 2);

  return value;
}

/**
 * Tells what an engine or editor input names: the pin, a package, or a working tree.
 *
 * @param what - `engine` or `editor`, for the error.
 * @param value - The input, from the flag or the variable.
 * @returns The source.
 * @throws {Error} When the input looks like a path and nothing is there.
 */
function sourceOf(what: string, value: string | undefined): Source {
  if (value === undefined || value === "") return { kind: "pin" };
  if (/^https?:\/\//u.test(value)) return { kind: "package", spec: value };

  const root = path.resolve(value);

  if (existsSync(root) && statSync(root).isDirectory()) return { kind: "path", root };
  if (/^[./~]/u.test(value)) throw new Error(`no ${what} working tree at ${root}.`);

  return { kind: "package", spec: value };
}

/**
 * Reads the command line and the `MOKU_ENGINE` / `MOKU_EDITOR` variables.
 *
 * @param argv - The arguments after the script.
 * @returns The command, the two sources and the arguments for the command.
 * @throws {Error} When the command is unknown.
 */
function invocationOf(argv: readonly string[]): Invocation {
  const [command = "", ...rest] = argv;

  if (!COMMANDS.includes(command)) {
    throw new Error(`no command "${command}". Name one of ${COMMANDS.join(", ")}.`);
  }

  const engine = takeFlag(rest, "--engine") ?? process.env.MOKU_ENGINE;
  const editor = takeFlag(rest, "--editor") ?? process.env.MOKU_EDITOR;

  return {
    command,
    engine: sourceOf("engine", engine),
    editor: sourceOf("editor", editor),
    rest
  };
}

/**
 * Runs a command in the demo folder with the terminal attached, and waits for it.
 *
 * @param command - The program.
 * @param args - Its arguments.
 * @param env - Variables added to this process's environment.
 * @returns The exit code.
 */
function exec(
  command: string,
  args: readonly string[],
  env: Record<string, string> = {}
): Promise<number> {
  return new Promise(resolve => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- bun and its tools come from PATH.
    const child = spawn(command, args, {
      cwd: demoRoot,
      stdio: "inherit",
      env: { ...process.env, ...env }
    });

    child.on("close", code => resolve(code ?? 1));
  });
}

/**
 * Installs the packages a run asks for over the pins of package.json, runs the command, and
 * puts package.json, bun.lock and node_modules back afterwards. In CI they stay: the runner is
 * done when the job is. `bun add <url>` over an installed version fails with a DependencyLoop,
 * so the spec is written into package.json and `bun install` follows.
 *
 * @param overrides - The packages to install for this run.
 * @param run - The command.
 * @returns The exit code of the command.
 */
async function withPackages(
  overrides: readonly Override[],
  run: () => Promise<number>
): Promise<number> {
  const manifestFile = path.join(demoRoot, "package.json");
  const lockFile = path.join(demoRoot, "bun.lock");
  const manifestText = readFileSync(manifestFile, "utf8");
  const lockText = readFileSync(lockFile, "utf8");
  const manifest = JSON.parse(manifestText) as DemoManifest;
  const changed = overrides.filter(item => manifest[item.section][item.name] !== item.spec);

  if (changed.length === 0) return run();

  for (const item of changed) {
    manifest[item.section][item.name] = item.spec;
    ui.info(`${item.name} for this run: ${item.spec}`);
  }

  writeFileSync(manifestFile, `${JSON.stringify(manifest, undefined, 2)}\n`);

  try {
    const installed = await exec("bun", ["install"]);

    return installed === 0 ? await run() : installed;
  } finally {
    if (process.env.CI === "true") {
      ui.info("CI: package.json and bun.lock keep the packages of this run.");
    } else {
      writeFileSync(manifestFile, manifestText);
      writeFileSync(lockFile, lockText);
      ui.info("package.json and bun.lock are back on their pins.");
      await exec("bun", ["install", "--frozen-lockfile"]);
    }
  }
}

/**
 * The packages a run installs over the pins: a version or URL for the engine or the editor.
 *
 * @param invocation - The command line, read.
 * @returns The overrides, none when both run from their pin or a working tree.
 */
function overridesOf(invocation: Invocation): Override[] {
  const overrides: Override[] = [];

  if (invocation.engine.kind === "package") {
    overrides.push({
      name: "@moku-labs/game",
      section: "dependencies",
      spec: invocation.engine.spec
    });
  }
  if (invocation.editor.kind === "package") {
    overrides.push({
      name: "@moku-labs/editor",
      section: "devDependencies",
      spec: invocation.editor.spec
    });
  }

  return overrides;
}

/**
 * Checks an engine working tree and names it for the tools: vitest, the Bun preload and the dev
 * page read `MOKU_ENGINE_SRC`.
 *
 * @param engine - The engine source.
 * @returns The variables for the command, none for an installed engine.
 * @throws {Error} When the folder is not an engine working tree.
 */
function engineEnv(engine: Source): Record<string, string> {
  if (engine.kind !== "path") return {};
  if (!existsSync(entrySource(engine.root, "index"))) {
    throw new Error(`${engine.root} is not an engine working tree: it has no src/index.ts.`);
  }

  ui.info(`engine from the working tree ${engine.root}`);

  return { [ENGINE_SRC_ENV]: engine.root };
}

/**
 * Finds the editor's bin: in node_modules for a pinned or installed editor, in the working tree
 * for a path. A working tree runs its build, so it must have one.
 *
 * @param editor - The editor source.
 * @returns The absolute path of the bin.
 * @throws {Error} When the working tree has no build.
 */
function editorBin(editor: Source): string {
  const root =
    editor.kind === "path" ? editor.root : path.join(demoRoot, "node_modules/@moku-labs/editor");
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    bin: Record<string, string>;
  };
  const bin = path.join(root, manifest.bin["moku-editor"] ?? "dist/bin.mjs");

  if (!existsSync(bin)) {
    throw new Error(
      `the editor at ${root} has no build (${bin}). Run "bun run build" in that tree first.`
    );
  }
  if (editor.kind === "path") ui.info(`editor from the working tree ${root}`);

  return bin;
}

/**
 * Writes the tsconfig of a typecheck against an engine working tree: the demo's own, with every
 * engine entry mapped to the tree's source. It goes to `.moku/`, which git ignores.
 *
 * @param root - The engine working tree.
 * @returns The path of the tsconfig.
 */
function engineTsconfig(root: string): string {
  const folder = path.join(demoRoot, ".moku");
  const file = path.join(folder, "tsconfig.engine.json");
  const paths = Object.fromEntries(
    engineEntries(root).map(entry => [
      entry === "index" ? "@moku-labs/game" : `@moku-labs/game/${entry}`,
      [entrySource(root, entry)]
    ])
  );

  mkdirSync(folder, { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ extends: "../tsconfig.json", compilerOptions: { paths } }, undefined, 2)}\n`
  );

  return file;
}

/**
 * Runs the editor scenarios: the vitest project `editor`, then the Playwright specs, both on the
 * editor and the engine of this run. An editor working tree also hands its root to vitest and to
 * the dev page plugin, so the scenarios import its build.
 *
 * @param invocation - The command line, read.
 * @param env - The engine variables of this run.
 * @returns The exit code: the first that failed, else 0.
 */
async function runEditorScenarios(
  invocation: Invocation,
  env: Record<string, string>
): Promise<number> {
  const { editor } = invocation;
  const editorEnv = {
    ...env,
    MOKU_EDITOR_BIN: editorBin(editor),
    ...(editor.kind === "path" ? { [EDITOR_ROOT_ENV]: editor.root } : {})
  };
  const vitest = await exec(
    "bun",
    ["--bun", "vitest", "run", "--project", "editor"],
    editorEnv
  );

  if (vitest !== 0) return vitest;

  // The specs and their screenshots belong to the Chromium of @playwright/test, which can be
  // newer than the playwright-core the visual tests use. In CI it is installed here.
  if (process.env.CI === "true") {
    const installed = await exec("bun", ["x", "playwright", "install", "chromium"]);

    if (installed !== 0) return installed;
  }

  return exec(
    "bun",
    ["x", "playwright", "test", "-c", EDITOR_E2E_CONFIG, ...invocation.rest],
    editorEnv
  );
}

/**
 * Runs one command with the engine and the editor already in place.
 *
 * @param invocation - The command line, read.
 * @returns The exit code.
 */
async function runCommand(invocation: Invocation): Promise<number> {
  const env = engineEnv(invocation.engine);
  const { rest } = invocation;
  const assets = "node_modules/@moku-labs/game/bin/moku-game-assets.mjs";
  const pack = ["--root", ".", "--keys", "generated/assets.ts", "--pack", "dist/assets"];

  switch (invocation.command) {
    case "dev":
      return exec("bun", ["web/serve.ts", ...rest], env);
    case "editor":
      return exec(
        "bun",
        [editorBin(invocation.editor), "web/index.html", "--root", ".", ...rest],
        env
      );
    case "test":
      return exec(
        "bun",
        ["--bun", "vitest", "run", "--project", "unit", "--project", "e2e", ...rest],
        env
      );
    case "test:visual":
      return exec("bun", ["tests/visual/run.ts", ...rest], env);
    case "test:editor":
      return runEditorScenarios(invocation, env);
    case "typecheck": {
      const project =
        invocation.engine.kind === "path" ? ["-p", engineTsconfig(invocation.engine.root)] : [];

      return exec("bun", ["x", "tsc", "--noEmit", ...project, ...rest], env);
    }
    case "pack":
      return exec("bun", [assets, ...pack, ...rest], env);
    default: {
      const packed = await exec("bun", [assets, ...pack], env);

      return packed === 0 ? exec("bun", ["web/build.ts", ...rest], env) : packed;
    }
  }
}

try {
  const invocation = invocationOf(process.argv.slice(2));

  // Ctrl+C reaches the command too; the runner waits for it and then puts package.json back.
  process.on("SIGINT", () => undefined);
  process.exitCode = await withPackages(overridesOf(invocation), () => runCommand(invocation));
} catch (error) {
  ui.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
