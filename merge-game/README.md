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
bun run test:editor  # the editor scenarios on vitest
bun run test:editor:e2e  # the editor Playwright specs (about 20 min, local only)
```

## Scripts

| Script | What it does |
|---|---|
| `dev` | `moku-game dev`: serves the page the engine writes into `.moku/` and prints its URL. `--port 0` picks a free port. `?player=<name>` opens a save of `tests/scenarios/`. |
| `editor` | Starts `@moku-labs/editor` on this demo: `--root .`, the page from the engine. |
| `test` | Vitest: the game's unit tests and `tests/e2e/`. Fails on an empty test set. |
| `test:visual` | `moku-game visual` on `tests/visual/index.ts`: headless state checks, pixels on macOS. Serves the page itself. |
| `test:editor` | `tests/editor/`: the vitest project `editor`. |
| `test:editor:e2e` | `tests/browser/`: the Playwright specs, one run per project (`moku-editor e2e`). About 20 min, local only, not in CI. Arguments go to Playwright: `--project chromium-desktop -g pick`. |
| `typecheck` | `tsc --noEmit`. |
| `keys` | `moku-game keys`: writes `manifest.json`, `generated/assets.ts` and `generated/strings*.ts`. `shared/` is scanned as the layer `ui` (`assets.layers` in `config.ts`), so its keys stay `ui.*`. |
| `lint` | oxlint with the engine's rules (`@moku-labs/game/lint`): the layout rules (layers, feature doors, test suffixes) and the game rules. |
| `pack` | `moku-game pack`: packs the assets into `dist/assets/`. |
| `build` | `moku-game build`: packs, then builds the static page into `dist/web/`. |
| `native` | `moku-game native`: the Tauri app of `config.ts` `native`. `bun run native build ios --simulator`. |

## Another engine or editor

The scripts run the engine and the editor that `package.json` pins. To try another one, change
the pin and install:

```bash
# a release or a PR preview: edit the pin in package.json, then
"@moku-labs/game": "https://pkg.pr.new/@moku-labs/game@<pr>"
bun install
bun run test
```

A local engine or editor is packed first, then pinned as the `.tgz`:

```bash
cd <engine> && bun run build && bun pm pack
# in package.json: "@moku-labs/game": "<engine>/moku-labs-game-<version>.tgz"
bun install
bun run test
```

Put the pins back before a commit: `git checkout package.json bun.lock && bun install`.
`bun add <url>` over an installed version fails with a DependencyLoop, so edit the pin instead.

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
| `tests/visual/` | `test:visual` | Seven visual tests, listed in `index.ts`, baselines in `tests/visual/baselines/`. The fixture game is `tests/helpers/visual/fixture.ts`. |
| `tests/editor/*.editor.ts` | `test:editor` | The editor on the merge game through its public entries: server, agent and tools over the real wire. Moved from the editor. |
| `tests/browser/` | `test:editor:e2e` | Playwright (`*.browser.ts`): the editor's tools page on this game, served by the editor bin from a copy in `.moku/editor-e2e/`. Moved from the editor. |
| `tests/scenarios/` | `dev` | The prepared saves of `?player=<name>`: `ready`, `full`, `empty`. |
| `tests/helpers/` | | What the tests share: the headless game, the fake audio, the rules fixtures, the scenario builders, the visual fixture. |

Rewrite the visual baselines with `bun run test:visual --update` on a Mac. The editor screenshots
live in `tests/browser/__screenshots__/`: `bun run test:editor:e2e --update-snapshots`. The specs
run on the Chromium of `@playwright/test`: `bunx playwright install chromium` once. In CI
`moku-editor e2e` installs it.

## Native

`bun run native build ios --simulator` builds the Tauri app with `@moku-labs/native` into
`dist-native/`. The Tauri project lives in `.moku/tauri/`.
