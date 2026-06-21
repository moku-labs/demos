# Atlas

A real-time kanban tracker — the **Atlas redesign** of the Moku [`tracker`](../tracker) demo.

Atlas is a Layer-3 Moku consumer app composing **[@moku-labs/web](https://github.com/moku-labs/web)** (client / island layer) and **[@moku-labs/worker](https://github.com/moku-labs/worker)** (Cloudflare server: D1 / KV / R2 / Queues / Durable Objects). It's a fresh reimplementation of `tracker/` around the winning "Atlas" design concept and lives beside it as its own self-contained demo.

## Status

Scaffolded with `/moku:init` — tooling foundation only. The Atlas design is already finalized, so the web + worker composition (routes, islands, styles, Durable Objects, queues) is built next straight from it:

```
# design-context spec (done): /Users/alex/Projects/moku/assets/tracker-v2/design-context.md
/moku:plan create app --context <design-context.md>   →  design the web + worker composition (3 gates)
/moku:build app                                        →  implement from the plan
```

The design-context is a **spec, not source** — reimplement to plugin conventions; don't copy the prototype code.

## Develop

```sh
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

## Stack

| Concern            | Package                              |
| ------------------ | ------------------------------------ |
| Client / islands   | `@moku-labs/web` (Preact, SSG ⇄ SPA) |
| Server / data      | `@moku-labs/worker` (Cloudflare)     |
| Tooling            | Biome · ESLint 9 · Vitest · tsdown   |
| Runtime floor      | Node ≥ 24 · Bun ≥ 1.3.14             |

This is a Layer-3 **consumer** app: it never depends on `@moku-labs/core` directly. See [`CLAUDE.md`](./CLAUDE.md) for architecture and the Moku development workflow.
