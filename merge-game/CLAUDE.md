# Merge game (Timber Town)

A Layer-3 Moku **game demo** on **@moku-labs/game** (PixiJS v8, WebGPU): Timber Town, the merge
puzzle the engine was built against. It moved here from the engine's
`tests/integration/merge-game/` with its tests, in the same layout: ids, keys and file paths are
unchanged. The engine and the editor run this demo's tests on their own pull requests through
`moku-labs/ci` `demos.yml`.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

Every script goes through one runner, `scripts/run.ts`. Each takes `--engine <x>` and
`--editor <x>` (or `MOKU_ENGINE` / `MOKU_EDITOR`), where `<x>` is a version, a pkg.pr.new URL or
a local working tree. With no flag the pins of package.json run.

- `bun run dev` — the dev page (`web/serve.ts`), prints its URL. `--port 0` picks a free port.
- `bun run editor` — the editor on this demo.
- `bun run test` — vitest: the game's unit tests and the headless e2e tests (`tests/e2e/`).
- `bun run test:visual` — the visual tests (`tests/visual/`): headless state checks, plus pixels
  on macOS. It serves the page itself. `--no-pixels`, `--update`, `--only <name>`.
- `bun run test:editor` — the editor scenarios (`tests/editor/`, step A4). Skipped while empty.
- `bun run typecheck` — `tsc --noEmit`.
- `bun run pack` — packs the assets into `dist/assets/`.
- `bun run build` — pack, then the static page into `dist/web/`.
- `bun native.ts ios --simulator` — the native app (`@moku-labs/native`).

## Rules

- **No hardcoded local path.** A local engine or editor is only ever a command-line parameter:
  `bun run test --engine <path>`. Never write a machine path (a user's home folder) or a
  `../sibling` default into a tracked file. CI fails on them.
- The runner writes `.moku/` for a `--engine <path>` typecheck. It is gitignored.
- A test imports the engine through its public entries only (`@moku-labs/game`, `/testing`,
  `/visual`, `/inspect`, `/control`). Never reach into `node_modules/@moku-labs/game/dist` or the
  engine's `src/`. A browser API the engine takes through a seam gets a fake in `tests/helpers/`.
- Visual baselines live in `tests/visual/baselines/<test>/<checkpoint>/`. Pixels are shot on macOS.

## Layout

- `game.ts`, `state.ts`, `tables.ts`, `kit.ts` — the game, its save and its tables.
- `features/`, `flows/`, `nodes/`, `rules/`, `view/` — the game, as in the engine before the move.
- `web/` — the dev page, its server and the static build.
- `tests/helpers/` — what the e2e tests share. `tests/e2e/` — headless e2e. `tests/visual/` — the
  visual tests. `tests/editor/` — editor scenarios (step A4).
- `scripts/` — the runner and the engine-from-source glue (vitest alias, Bun preload, dev page
  plugin).
