# Moku Todo

A Layer-3 Moku **consumer demo app**: an **offline todo app** built on **@moku-labs/web** (Preact SPA +
island layer) and **@moku-labs/system** (store, notifications, clipboard, tray, deep links), packaged
for **macOS and iOS** by **@moku-labs/native**. One codebase, web and native. No worker, no deploy, no
Cloudflare.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run build` — `scripts/build.ts`: bundle the web SPA → `dist/` via the web app's `cli.build()`
- `bun run dev` — `scripts/dev.ts`: `cli.serve()` dev server on port 4173 with live reload
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` — Biome check + ESLint
- `bun run lint:fix` — Auto-fix lint issues
- `bun run format` — Format with Biome
- `bun run test` — Run all tests (vitest)
- `bun run test:unit` — Unit tests only
- `bun run test:integration` — Integration tests only
- `bun run test:coverage` — Tests with coverage
- `bun run native:build:macos` — package the macOS app → `dist-native/macos/`
- `bun run native:build:ios-sim` — build the iOS simulator slice
- `bun run native:dev` — run the app in the native shell against the dev server
- `bun run native:doctor` — check the native toolchain
- `bun run native:clean` — delete the generated Tauri project (`.moku/`)

## Code Style

- **Formatter:** Biome (2-space indent, double quotes, semicolons, no trailing commas)
- **Linter:** ESLint 9 flat config + Biome (`eslint-config-biome` must be LAST)
- **TypeScript:** Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`;
  `jsx: react-jsx` + `jsxImportSource: preact` for the island/component layer
- **Imports:** Use `import type` enforced via `@typescript-eslint/consistent-type-imports`
- **JSDoc:** Required on all source exports with descriptions, params, returns, and examples
- **Web patterns:** `data-*` attributes only (no CSS classes), `@scope` / `@layer` encapsulation,
  design tokens, island architecture — see the **moku-web** skill

## Architecture

This is a **Layer-3 consumer app** — it composes existing Moku frameworks via `createApp`. It does
**not** define a framework (no `createCoreConfig` / `createCore`) and must **never** depend on
`@moku-labs/core` directly (the frameworks pull it in transitively — that's fine).

**`createApp` instances compose side-by-side:**

1. **Web SPA — `@moku-labs/web`.** `src/spa.tsx` is the browser entry (`@moku-labs/web/browser`,
   `mode: "spa"`) over **one** route table (`src/routes.tsx`). `src/index.ts` is the Node build
   composition (`buildPlugin` / `cliPlugin`) used by `scripts/build.ts` and `scripts/dev.ts`.
2. **Native packager — `@moku-labs/native`.** `src/native.ts` — Node-only. App "Moku Todo",
   identifier `dev.moku.todo`, targets `macos` + `ios`, deep-link scheme `mokutodo`. The
   `scripts/native-*.ts` files are one thin script per `native.cli` verb. It generates a gitignored
   Tauri project in `.moku/`; installers land in `dist-native/`. Nothing here ships inside the app.
3. **System API — `@moku-labs/system`.** Isomorphic capabilities (Tauri provider inside the shell,
   web fallback in the browser). Composed by the build step.

**`src/system.ts` is the shared contract:** one name-only list of system plugins (`store`,
`notification`, `clipboard-manager`, `tray`, `deep-link`). The native app codegens the whole
permission surface from it. Change capabilities there, nowhere else.

### Source layout (mirrors `demos/trivia`)

- `src/components/` — flat Preact components, each with a co-located `.css`
- `src/islands/` — `createIsland(...)` surfaces + `index.ts` registry
- `src/layouts/`, `src/pages/` — route layouts and pages
- `src/styles/` — `main.css` (layers, tokens) + `components.css` aggregator
- `src/plugins/` — Layer-3 plugins, each with its own `__tests__/`

Only the scaffold exists today; these folders are created by the build step when first needed.

### Local packages

`@moku-labs/system` and `@moku-labs/native` install from tarballs in `../../.local-packages/`
(the npm versions are old and broken). Switch both to npm versions once they are released.

## Testing

- Vitest with unit + integration projects
- App-level tests: `tests/unit/` and `tests/integration/`
- Plugin-specific tests: `src/plugins/[name]/__tests__/unit/` and `__tests__/integration/`
- 90% coverage threshold
- Never put plugin-specific tests in root `tests/`

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

Knowledge skills load themselves when the topic comes up: **moku-core**, **moku-plugin**,
**moku-common** (`ctx.log`, `ctx.env`, the branded CLI), **moku-testing**, **moku-readable-code**,
plus **moku-web** for the Preact + island layer.

## Specification

For questions about how things should be implemented, refer to the
[Moku Core specification](https://github.com/moku-labs/core/tree/main/specification).
