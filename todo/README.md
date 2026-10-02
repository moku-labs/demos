# Moku Todo

An offline todo app. One codebase runs on the web and as a native macOS / iOS app.

| Layer | Package |
|-------|---------|
| Web SPA | `@moku-labs/web` 2.3.2 + Preact |
| System API (store, notifications, clipboard, tray, deep links) | `@moku-labs/system` 0.1.0 |
| Native packaging (Tauri) | `@moku-labs/native` 0.1.0 |

## Run

```bash
bun install
bun run dev                 # web dev server, http://localhost:4173
bun run build               # web build → dist/
bun run native:doctor       # check the native toolchain
bun run native:dev          # app in the native shell
bun run native:build:macos  # installers → dist-native/macos/
bun run native:build:ios-sim
```

`bun run dev --port 4180` picks another port.

## Deep links

| Link | Effect |
|------|--------|
| `mokutodo://add?title=Buy%20milk` | Adds the todo. |
| `mokutodo://probe` | Runs every capability probe, updates the System panel, and writes the report to the store key `diagnostics`. |

On the web the same links arrive through the `?deeplink=` parameter:

```
http://localhost:4173/?deeplink=mokutodo%3A%2F%2Fprobe
```

## Package versions

`@moku-labs/system` and `@moku-labs/native` need `0.2.0` or newer. Older versions do not build a
working native app.
