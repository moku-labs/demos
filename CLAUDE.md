# moku demos — monorepo

A collection of standalone Moku demo apps. Each top-level folder (e.g. `tracker/`) is a complete,
**self-contained** Layer-3 consumer app with its own `package.json`, lockfile, build, tests, and
deploy config.

## Conventions

- **Not a workspace.** There is no root `package.json` and no dependency hoisting. Each demo
  installs and runs on its own (`cd <demo> && bun install`). This keeps demos copy-paste runnable
  and lets each pin its own `@moku-labs/*` versions.
- **Use `bun`** exclusively, per each demo's own CLAUDE.md.
- **Per-demo work stays in that demo's folder.** Cross-demo changes — e.g. bumping a shared
  `@moku-labs/*` version across every demo as the framework evolves — are fine as a single commit,
  since this is one repo (that lockstep is the main reason demos live together).
- Each demo keeps its own `CLAUDE.md` with app-specific rules — read it before working in that demo.
- A demo that outgrows "demo" and becomes a real product can be carved out **with history** via
  `git subtree split` / `git filter-repo`.

## Demos

- `tracker/` — real-time kanban board (web + worker: D1 / KV / R2 / Queues / Durable Objects).
