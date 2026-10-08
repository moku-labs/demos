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

Every script is a plain command on the engine and editor that package.json pins. Another
version or a pkg.pr.new preview: edit the pin in package.json, then `bun install`. A local engine:
`cd <engine> && bun run build && bun pm pack`, pin the `.tgz` path, `bun install`. Put the pins
back before a commit. `bun add <url>` over an installed version fails with a DependencyLoop.

- `bun run dev` — `moku-game dev`: the page the engine writes into `.moku/`, prints its URL.
  `--port 0` picks a free port. `?player=<name>` opens a save of `tests/scenarios/`.
- `bun run editor` — the editor on this demo.
- `bun run test` — vitest: the game's unit tests and the headless e2e tests (`tests/e2e/`).
- `bun run test:visual` — `moku-game visual`, the visual tests of `tests/visual/index.ts`:
  headless state checks, plus pixels on macOS. It serves the page itself. `--no-pixels`, `--update`, `--only <name>`.
- `bun run test:editor` — the editor scenarios: the vitest project `editor`
  (`tests/editor/*.editor.ts`).
- `bun run test:editor:e2e` — the Playwright specs (`tests/browser/`, about 20 min, local only,
  never in CI), one run per project (`moku-editor e2e`). Arguments go to Playwright. They
  need the Chromium of `@playwright/test`: `bunx playwright install chromium`.
- `bun run typecheck` — `tsc --noEmit`.
- `bun run keys` — `moku-game keys`: the assets and strings into `manifest.json` and `generated/`.
  `shared/` is scanned as the layer `ui` (`assets.layers` in `config.ts`), so its keys stay `ui.*`.
- `bun run lint` — oxlint with the engine's rules (`.oxlintrc.json`, `@moku-labs/game/lint`).
- `bun run pack` — `moku-game pack`: the assets into `dist/assets/`.
- `bun run build` — `moku-game build`: pack, then the static page into `dist/web/`.
- `bun run native build ios --simulator` — `moku-game native`: the native app into `dist-native/`.

## Rules

- **No hardcoded local path.** A local `.tgz` pin is for trying only, never committed. Never
  write a machine path (a user's home folder) or a `../sibling` default into a tracked file. CI
  fails on them.
- `moku-game` writes the dev page and the Tauri project into `.moku/`, and the editor e2e copies
  the game into `.moku/editor-e2e/`. It is gitignored.
- A test imports the engine through its public entries only (`@moku-labs/game`, `/app`, `/testing`,
  `/visual`, `/inspect`, `/control`), and the editor through its public entries only
  (`@moku-labs/editor`, `/agent`, `/server`, `/tools`). Never reach into `node_modules/@moku-labs/game/dist` or the
  engine's `src/`. A browser API the engine takes through a seam gets a fake in `tests/helpers/`.
- Visual baselines live in `tests/visual/baselines/<test>/<checkpoint>/`. Pixels are shot on macOS.

## Layout

The layered layout (v15): `core ← shared ← features ← game.ts`, composed by `index.ts`. `bun run lint`
checks it.

- `index.ts` — the game as one data object: `export default defineGameApp({ ... })`. Tests make
  its apps with `game.headless()` and `game.screen()`.
- `config.ts` — the page, native app, system plugins, save and asset layers. Plain data, no call.
- `game.ts` — the root flow `mainFlow`, and the volumes and dev locales the configs read.
  Features come from the `@features` barrel, plugins from `@plugins`.
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
- `tests/e2e/` — headless e2e. `tests/visual/` — the visual tests and baselines.
  `tests/editor/` — editor scenarios (`*.editor.ts`, `helpers/` for vitest). `tests/browser/` —
  the Playwright specs (`*.browser.ts`, config, screenshots). `tests/scenarios/` — the prepared
  saves of `?player=<name>`. `tests/helpers/` — what the tests share.
- Vitest gets the layer aliases from `vitest.config.ts`, which repeats `tsconfig.json` `paths`.
