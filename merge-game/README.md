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
bun run test:editor  # the editor scenarios: vitest, then Playwright
```

## Scripts

| Script | What it does |
|---|---|
| `dev` | Serves the dev page (`web/serve.ts`) and prints its URL. `--port 0` picks a free port. |
| `editor` | Starts `@moku-labs/editor` on this demo. |
| `test` | Vitest: the game's unit tests and `tests/e2e/`. Fails on an empty test set. |
| `test:visual` | `tests/visual/`: headless state checks, pixels on macOS. Serves the page itself. |
| `test:editor` | `tests/editor/`: the vitest project `editor`, then the Playwright specs. Extra arguments go to Playwright. |
| `typecheck` | `tsc --noEmit`. |
| `pack` | Packs the assets into `dist/assets/`. |
| `build` | `pack`, then the static page into `dist/web/`. |

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
  dedupes Pixi, core and common. A Bun preload does the same for scripts, the dev page bundles
  from source, and `typecheck` uses a generated tsconfig in `.moku/` (gitignored).
- **Editor path:** runs the editor's built bin from that tree. Build it there first. The editor
  scenarios import that build too (vitest alias, dev page plugin) and dedupe the engine and preact.

A path is always a parameter. No default path is written anywhere.

The runner lives in this demo because demos share no root code. It moves into the engine CLI
later.

## Tests

| Folder | Runs in | What |
|---|---|---|
| `__tests__/`, `rules/__tests__/`, `features/**/__tests__/` | `test` | The game's own unit tests. |
| `tests/e2e/` | `test` | Headless e2e: the game with its screen, played through taps and routes. Moved from the engine. |
| `tests/visual/` | `test:visual` | Seven visual tests, baselines in `tests/visual/baselines/`. |
| `tests/editor/*.editor.ts` | `test:editor` | The editor on the merge game through its public entries: server, agent and tools over the real wire. Moved from the editor. |
| `tests/editor/e2e/` | `test:editor` | Playwright: the editor's tools page on this game, served by the editor bin from a copy in `.moku/editor-e2e/`. Moved from the editor. |

Rewrite the visual baselines with `bun run test:visual --update` on a Mac. The editor screenshots
live in `tests/editor/e2e/__screenshots__/`: `bun run test:editor --update-snapshots`. The specs
run on the Chromium of `@playwright/test`: `bunx playwright install chromium` once. In CI the
runner installs it.

## Native

`bun native.ts ios --simulator` builds the Tauri app with `@moku-labs/native`.
