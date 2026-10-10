# ticktoe

Tic-tac-toe against a bot. A 2D game on @moku-labs/game.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run dev` — The game page with hot reload on http://127.0.0.1:3000/
- `bun run editor` — The same page with the editor's tools on http://127.0.0.1:3000/__editor/
- `bun run keys` — Write `generated/`: asset keys, compiled strings, the dev manifest
- `bun run pack` — The production asset pack in `dist/assets`
- `bun run build` — `keys --check`, then the pack and the production page in `dist/web`
- `bun run native` — One verb of `@moku-labs/native`. Needs `native` in `config.ts`
- `bun run lint` — Biome check + oxlint
- `bun run lint:fix` — Auto-fix lint issues
- `bun run format` — Format with Biome
- `bun run typecheck` — `tsc --noEmit`
- `bun run test` — Headless tests: the vitest project `unit`, on Bun (`bun --bun vitest`)
- `bun run test:coverage` — The same tests with coverage
- `bun run test:visual` — `moku-game visual`: state and layout everywhere, pixels on a Mac. `--no-pixels`, `--update`, `--only <name>`
- `bun run test:editor` — The editor on the game and the hot swap test: the vitest projects `editor` and `hot`
- `bun run test:hot` — The hot swap test alone. Needs Chromium: `bunx playwright-core install chromium`

There is no `bunfig.toml`. Add a package with `bun add --exact`.

## Code Style

- **Formatter:** Biome (2-space indent, double quotes, semicolons, no trailing commas)
- **Linter:** Biome + oxlint (`.oxlintrc.json`: unicorn, jsdoc and abbreviation rules, plus the ten `moku-game/*` engine rules)
- **TypeScript:** 6, strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Not 7: the editor's project index needs the TypeScript JS API
- **Imports:** Use `import type`, enforced by Biome `useImportType`
- **JSDoc:** Required on all source exports with descriptions, params, returns, and examples

## Architecture

A game is a folder at the project root. It has no `src/` and calls no `createApp`.

- `index.ts` — the game as one data object (`defineGameApp`)
- `config.ts` — the page, the native app and the save, as plain data
- `game.ts` — the root flow
- `core/` — the state and the kit
- `shared/` — what two features need
- `features/<name>/` — one feature: `flow/`, `views/`, `strings/`, and later `rules/`, `styles/`, `assets/`
- `plugins/<name>/` — the game's own plugins
- `generated/` — written by `bun run keys`. Never edit it

A layer imports only from the layers below it: core, then shared, then features. A feature reaches
another feature through `@features/<name>` only. Only `index.ts` and `game.ts` import `@features`.
Run `bun run keys` after adding an asset or a message, before the typecheck.

## Testing

- Headless tests in `tests/integration/` and `features/<name>/__tests__/`: `*.test.ts`
- Visual tests in `tests/visual/*.visual.ts`, listed in `tests/visual/index.ts`. The baselines in `tests/visual/baselines/<test>/<checkpoint>/` are committed: `state.json`, `describe.json` and `screen.webp`. Pixels are shot on macOS
- A visual checkpoint holds no moment of a clock: the headless leg runs on a fake clock, the page on the device clock. Restore such a state with `NEVER_DUE` (`tests/helpers/visual.ts`), do not play it
- Editor tests in `tests/editor/*.editor.ts`, helpers in `tests/editor/helpers/`: the three cores of `@moku-labs/editor` over the real wire, the tools page in happy-dom
- The hot swap test in `tests/hot/*.hot.ts`: `moku-game dev` on a temp copy of the game, in headless Chromium
- A test never uses port 3000 and never writes into the game: free ports, temp copies
- Prepared saves in `tests/scenarios/<name>.ts`, opened with `?player=<name>`
- 90% coverage threshold on the logic. The `.tsx` views are not counted

## Demo rules

The game is a demo of `moku-labs/demos` (`"moku": { "demo": true }` in `package.json`). The workflow
`demos.yml` of `moku-labs/ci` runs `bun run test` on ubuntu, `bun run test:visual` on macOS and
`bun run test:editor` on ubuntu, after `bun install --frozen-lockfile`.

- **No hardcoded local path.** Never write a machine path (a user's home folder) or a `../sibling`
  default into a tracked file. CI fails on them
- `@moku-labs/game` stays in `dependencies` and `@moku-labs/editor` in `devDependencies`, each with
  an exact version: CI writes the engine or the editor under test over these pins
- A green run of a test script prints its summary and nothing else. Silence a noise where it is
  made, in the test or its config. One line is not the game's: `Bundled page in … ms` on the
  stderr of `test:visual` is Bun's dev server, which the engine starts for the pixel leg
- The folder has no workflow and no git hook of its own

## Moku Development Toolkit

This project uses the **moku** Claude Code plugin. Talk to it in plain words — the `moku` conductor
skill works out where the project stands and drives the lifecycle (intake, brainstorm, design, plan,
build, verify, e2e, release, close). You never need to remember a command.

Underneath the conversation, `moku-rails` enforces the order: a source file cannot be written before
the station that is allowed to write it. When a write is refused, the reason names the missing step.

Useful directly:

- `/moku:status` — where the project stands.
- `/moku:check` — diagnostics on the installation and the project.
- `/moku:verify` — the validator fan-out with the auto-fix loop.
- `/moku:upgrade` — move the toolchain to the current target stack.

Knowledge skills load themselves when the topic comes up: **moku-core** (architecture, factory
chain, lifecycle, events), **moku-plugin** (plugin structure and tiers), **moku-common-conventions** (`ctx.log`,
`ctx.env`, the branded CLI rules MC1–MC3), **moku-testing**, **moku-readable-code**, plus the framework pack for
whatever this project uses.

## Specification

For questions about how things should be implemented, read `node_modules/@moku-labs/game/llms.txt`.
It is the engine in one page and always matches the installed version.
