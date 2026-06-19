# moku demos

Showcase consumer apps built on the [Moku](https://github.com/moku-labs) framework family
(`@moku-labs/web`, `@moku-labs/worker`, …). Each demo is a **self-contained** Layer-3 app — its own
`package.json`, lockfile, build, tests, and deploy config — so it can be copied out and run on its
own, and can pin its own `@moku-labs/*` versions.

This is a **monorepo, not a workspace**: there is no root `package.json` and no dependency hoisting.
`cd` into a demo and use its own scripts.

## Demos

| Demo | Stack | What it shows |
|------|-------|---------------|
| [`tracker`](tracker/) | web + worker — D1, KV, R2, Queues, Durable Objects | Real-time kanban board; full Layer-3 web + worker composition |

## Running a demo

```bash
cd tracker
bun install
bun run test
bun run dev
```

## Adding a demo

1. Create a new top-level folder `<name>/` — a complete, standalone Moku app.
2. Add a row to the table above.
3. Keep it self-contained — no root-level shared dependencies, no workspace hoisting.
