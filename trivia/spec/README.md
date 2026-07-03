# Trivia — design specs (the single source of truth)

> **This folder is what we are building.** Planner and builder: read these here — do not go searching
> for the design elsewhere (the sibling `../../assets/trivia/` originals and the `.planning/design/`
> capture are mirrored here on purpose).
>
> **Spec, not source.** These docs describe the **WHAT** (look, feel, behaviour, every screen and
> element, the game rules, the question pipeline). The Moku conventions are the **HOW**
> (moku-web islands, `@scope`/`@layer`, `data-*` only, design tokens, one route table, node-free
> bundle, readable-code). **Re-implement from scratch — never port the throwaway prototype.**

| File | What it is |
|------|-----------|
| [`design-context.md`](./design-context.md) | **The authoritative design spec** — captured by `/moku:design`. Claymorphic Toy 3D look & feel, the two-surface (TV/phone) interaction language, and the **exhaustive** screen/element inventory (A1–A15, B1–B2, C1–C2, D1–D4, E1–E2, F1–F14, components G). Start here. |
| [`TRIVIA_DESIGN.md`](./TRIVIA_DESIGN.md) | The game-design narrative — screens, flow, animation catalog, popups, edge cases, accessibility. Earlier than `design-context.md`; where they differ, `design-context.md` wins. |
| [`SPEC.md`](./SPEC.md) | The original concept — Moku Room + Trivia idea, the game brief, and the question-generation requirements. |
| [`TRIVIA_SKILL.md`](./TRIVIA_SKILL.md) | The starter skeleton for the **`/trivia-gen`** question-generation Claude skill (args, languages, types, difficulty, quality review, answer obfuscation, output). The built skill extends this. |
| [`scoreboard-animation.md`](./scoreboard-animation.md) | **The scoreboard animation schema** — the derived-position model (unique slots, the exceed rule for ties), the delta→reorder→settled choreography, invariants I1–I6, and the exhaustive S1–S14 transition case matrix every change must keep green (each case maps to a unit test, an e2e test, and a recorded review artifact). |

## How this maps to the build

- **What we're building:** a Layer-3 Moku couch-multiplayer party quiz on the **latest room
  framework** (`@moku-labs/room@0.2.0`, a standalone `@moku-labs/core` framework) + `@moku-labs/web`.
- **One app, role by URL, one Cloudflare deploy:** `/` = TV/stage, `/controller/:code` = phone; one
  room `./server` Hub-DO worker serves the SPA (`ASSETS`) and brokers join (`serverSignaling`).
- **Architecture, decisions, plugin list, risks, spec alignment:** see
  [`../.planning/context-trivia.md`](../.planning/context-trivia.md) (the brainstorm output that
  `/moku:plan` consumes).
