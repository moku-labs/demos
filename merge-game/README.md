# merge-game

**Timber Town** — the merge puzzle of [`@moku-labs/game`](https://github.com/moku-labs/game), as a
standalone demo. Tap the sawmill for twigs, merge them into planks and logs, deliver the orders.
PixiJS v8 on WebGPU, the editor on top.

The engine and the editor run this demo's tests on every pull request (`moku-labs/ci`
`demos.yml`), so a change that breaks a real game shows on its own PR.

## Run it

```bash
bun install
bun run dev        # the game in the browser, prints the URL
bun run editor     # the editor on the game
bun run test       # unit + headless e2e
bun run test:editor  # the editor scenarios on vitest; --e2e adds the Playwright specs (local only)
```

## Scripts

| Script | What it does |
|---|---|
| `dev` | `moku-game dev`: serves the page the engine writes into `.moku/` and prints its URL. `--port 0` picks a free port. `?player=<name>` opens a save of `tests/scenarios/`. |
| `editor` | Starts `@moku-labs/editor` on this demo: `--root .`, the page from the engine. |
| `test` | Vitest: the game's unit tests and `tests/e2e/`. Fails on an empty test set. |
| `test:visual` | `tests/visual/`: headless state checks, pixels on macOS. Serves the page itself. |
| `test:editor` | `tests/editor/`: the vitest project `editor`. `--e2e` adds the Playwright specs (about 20 min, local only, not in CI); then extra arguments go to Playwright. |
| `typecheck` | `tsc --noEmit`. |
| `keys` | `moku-game keys`: writes `manifest.json`, `generated/assets.ts` and `generated/strings*.ts`. `shared/` is scanned as the layer `ui` (`assets.layers` in `config.ts`), so its keys stay `ui.*`. |
| `lint` | oxlint with the engine's rules (`@moku-labs/game/lint`): the layout rules (layers, feature doors, test suffixes) and the game rules. |
| `pack` | `moku-game pack`: packs the assets into `dist/assets/`. |
| `build` | `moku-game build`: packs, then builds the static page into `dist/web/`. |
| `native` | `moku-game native`: the Tauri app of `config.ts` `native`. `bun run native build ios --simulator`. |

## Another engine or editor

Every script runs through `scripts/run.ts` and takes the same two inputs:

```bash
bun run test --engine 0.8.0                                       # a release
bun run test --engine https://pkg.pr.new/@moku-labs/game@<sha>    # a PR preview
bun run test --engine <path-to-engine-working-tree>               # local source, no build
bun run editor --engine <engine-path> --editor <editor-path>      # local editor build
```

`MOKU_ENGINE` and `MOKU_EDITOR` do the same as the flags.

- **Version or URL:** installed for this run. Locally `package.json` and `bun.lock` go back to
  their pins afterwards. In CI (`CI=true`) they stay.
- **Engine path:** no install and no build. Vitest aliases every entry to the tree's `src/` and
  dedupes Pixi, core and common (`scripts/engine.ts`). `moku-game` and the editor bin get the
  engine's recipe, `--preload <tree>/scripts/tree/preload.ts --serve-plugin
  <tree>/scripts/tree/bundle.ts`. `typecheck` uses a generated tsconfig in `.moku/` (gitignored).
- **Editor path:** runs the editor's built bin from that tree. Build it there first. The editor
  scenarios import that build too (vitest alias, dev page plugin) and dedupe the engine and preact.

A path is always a parameter. No default path is written anywhere.

The runner lives in this demo because demos share no root code. It moves into the engine CLI
later.

## Layout

The game is layered: `core ← shared ← features ← game.ts`, and `index.ts` composes it. Between layers a file imports through
the aliases of `tsconfig.json`; inside one feature, by relative path. `bun run lint` checks it.

| Path | What |
|---|---|
| `index.ts` | The game as one data object: `export default defineGameApp({ ... })`. Tests make its apps with `game.headless()` and `game.screen()`. |
| `config.ts` | The page, the native app, the system plugins, the save and the asset layers. Plain data. |
| `game.ts` | The root flow `mainFlow`, and the volumes and dev locales the plugin configs read. |
| `core/` | What the game is: the definers (`kit.ts`), the save (`state.ts`), the content tables (`tables.ts`) and the domain types (`types.ts`). No logic, no feature. `@core/*`. |
| `shared/` | The layer over the features, the feature `shared`: views, the popup layout, the popup flow helper, effects, motions, tokens and text styles, the `ui` bundle and the strings every screen shares. Its door is `@shared`; the rules more than one feature needs are behind `@shared/rules`. |
| `features/<name>/` | One feature: `index.ts` is its only door (`@features/<name>`), next to `types.ts`. Inside, a folder per kind: `flow/`, `rules/`, `screens/`, `popups/`, `views/`, `world/`, `styles/`, `motion/`, `effects/`, `plugins/`, `assets/`, `strings/`, `__tests__/`. |
| `features/index.ts` | The feature barrel `@features`: only `index.ts` and `game.ts` import it. |
| `plugins/` | The general plugins of the game (loading, locale, exit, ui sounds), knowing no feature. The barrel `@plugins`. |
| `generated/` | Written by `bun run keys`. `@generated/*`. |

## Tests

| Folder | Runs in | What |
|---|---|---|
| `features/<name>/__tests__/unit/`, `shared/__tests__/unit/`, `plugins/<name>/__tests__/unit/` | `test` | The unit tests of one feature, of the shared layer and of one plugin. |
| `tests/e2e/` | `test` | Headless e2e: the game with its screen, played through taps and routes. Moved from the engine. |
| `tests/visual/` | `test:visual` | Seven visual tests, baselines in `tests/visual/baselines/`. The runner is `tests/helpers/visual/`. |
| `tests/editor/*.editor.ts` | `test:editor` | The editor on the merge game through its public entries: server, agent and tools over the real wire. Moved from the editor. |
| `tests/browser/` | `test:editor --e2e` | Playwright (`*.browser.ts`): the editor's tools page on this game, served by the editor bin from a copy in `.moku/editor-e2e/`. Moved from the editor. |
| `tests/scenarios/` | `dev` | The prepared saves of `?player=<name>`: `ready`, `full`, `empty`. |
| `tests/helpers/` | | What the tests share: the headless game, the fake audio, the rules fixtures, the scenario builders, the visual runner. |

Rewrite the visual baselines with `bun run test:visual --update` on a Mac. The editor screenshots
live in `tests/browser/__screenshots__/`: `bun run test:editor --e2e --update-snapshots`. The specs
run on the Chromium of `@playwright/test`: `bunx playwright install chromium` once. In CI the
runner installs it.

## Native

`bun run native build ios --simulator` builds the Tauri app with `@moku-labs/native` into
`dist-native/`. The Tauri project lives in `.moku/tauri/`.
