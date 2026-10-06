# Merge game (Timber Town)

A Layer-3 Moku **game demo** on **@moku-labs/game** (PixiJS v8, WebGPU): Timber Town, the merge
puzzle the engine was built against. It moved here from the engine's
`tests/integration/merge-game/` with its tests, and then into the layered layout (v15). The ids and
keys did not change in either move: asset keys and text styles stay `ui.*`, projection names,
flow ids, node keys, scene ids and emitters are the ones the baselines pin. The engine and the
editor run this demo's tests on their own pull requests through `moku-labs/ci` `demos.yml`.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

Every script goes through one runner, `scripts/run.ts`. Each takes `--engine <x>` and
`--editor <x>` (or `MOKU_ENGINE` / `MOKU_EDITOR`), where `<x>` is a version, a pkg.pr.new URL or
a local working tree. With no flag the pins of package.json run.

- `bun run dev` — the dev page (`web/serve.ts`), prints its URL. `--port 0` picks a free port.
- `bun run editor` — the editor on this demo.
- `bun run test` — vitest: the game's unit tests and the headless e2e tests (`tests/e2e/`).
- `bun run test:visual` — the visual tests (`tests/visual/`, runner in `tests/helpers/visual/`):
  headless state checks, plus pixels on macOS. It serves the page itself. `--no-pixels`, `--update`, `--only <name>`.
- `bun run test:editor` — the editor scenarios: the vitest project `editor`
  (`tests/editor/*.editor.ts`). `--e2e` adds the Playwright specs (`tests/browser/`, about
  20 min, local only, never in CI); then extra arguments go to Playwright. They need the Chromium of
  `@playwright/test`: `bunx playwright install chromium`.
- `bun run typecheck` — `tsc --noEmit`.
- `bun run keys` — scans the assets and strings into `manifest.json` and `generated/`. `shared/` is
  scanned as the layer `ui` (`--layer shared=ui`), so its keys stay `ui.*`.
- `bun run lint` — oxlint with the engine's rules (`.oxlintrc.json`, `@moku-labs/game/lint`).
- `bun run pack` — packs the assets into `dist/assets/`.
- `bun run build` — pack, then the static page into `dist/web/`.
- `bun native.ts ios --simulator` — the native app (`@moku-labs/native`).

## Rules

- **No hardcoded local path.** A local engine or editor is only ever a command-line parameter:
  `bun run test --engine <path>`. Never write a machine path (a user's home folder) or a
  `../sibling` default into a tracked file. CI fails on them.
- The runner writes `.moku/` for a `--engine <path>` typecheck, and the editor e2e copies the
  game into `.moku/editor-e2e/`. It is gitignored.
- A test imports the engine through its public entries only (`@moku-labs/game`, `/testing`,
  `/visual`, `/inspect`, `/control`), and the editor through its public entries only
  (`@moku-labs/editor`, `/agent`, `/server`, `/tools`). Never reach into `node_modules/@moku-labs/game/dist` or the
  engine's `src/`. A browser API the engine takes through a seam gets a fake in `tests/helpers/`.
- Visual baselines live in `tests/visual/baselines/<test>/<checkpoint>/`. Pixels are shot on macOS.

## Layout

The layered layout (v15): `core ← shared ← features ← game.ts`. `bun run lint` checks it.

- `game.ts` — the one entry: the root flow `mainFlow`, the screen plugins, `createGame` and
  `createScreenGame`. Features come from the `@features` barrel, plugins from `@plugins`.
- `core/` — `kit.ts`, `state.ts`, `tables.ts`, `types.ts`. No logic, no feature import. `@core/*`.
- `shared/` — the feature `shared`: views, layouts, effects, motions, tokens, text styles, the `ui`
  bundle and the strings. Door `@shared`; the rules used by two or more features are behind
  `@shared/rules`.
- `features/<name>/` — `index.ts` is the only door (`@features/<name>`); `types.ts` holds the
  public types. Kind folders: `flow/ rules/ screens/ popups/ views/ world/ styles/ motion/ effects/
  plugins/ assets/ strings/ __tests__/{unit,isolated,visual,fixtures}`. Relative imports inside a
  feature, aliases across. A feature never imports its own door.
- `plugins/` — loading, locale, exit, ui-sounds: they know no feature. Barrel `@plugins`.
- `generated/` — `bun run keys` writes it.
- `web/`, `native.ts`, `platform-bridge.ts`, `bunfig.toml` — the dev page, its server, the build
  and the native app, until the engine CLI takes them.
- `tests/e2e/` — headless e2e. `tests/visual/` — the visual tests and baselines.
  `tests/editor/` — editor scenarios (`*.editor.ts`, `helpers/` for vitest). `tests/browser/` —
  the Playwright specs (`*.browser.ts`, config, page entry, screenshots). `tests/helpers/` — what
  the tests share.
- `scripts/` — the runner and the engine-from-source glue (vitest alias, Bun preload, dev page
  plugin). Vitest gets the layer aliases from `vitest.config.ts`, which repeats `tsconfig.json`
  `paths`.
