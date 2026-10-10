# loadProgress

Turns the engine's asset loading events into two inbox events of the flow: `progress { pct }`, coalesced by a
step, and `ready`, once, when every configured bundle is loaded. The splash screen waits for them.

Standard tier. No API, no events of its own. Depends on `assetsPlugin` (its events) and `flowPlugin` (its inbox).

## Config

```ts
pluginConfigs: { loadProgress: { bundles: ["match"], step: 0.25 } }
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `bundles` | `readonly BundleKey[]` | `[]` | The bundles that must be loaded before `ready` is posted. `BundleKey` is the union in `generated/assets.ts` |
| `step` | `number` | `0.25` | Smallest growth of the overall fraction that posts one more `progress`, 0..1 |

## What it posts

It posts into `flow.inbox`. A rest node receives an event when its `inbox` lists the type.

| Type | Payload | When |
|---|---|---|
| `progress` | `{ pct: number }`, 0..1 | The overall fraction reached the last posted one plus `step`, and `ready` was not posted |
| `progress` | `{ pct: 1 }` | The last configured bundle was loaded, right before `ready` |
| `ready` | none | Every configured bundle is loaded. Once. On start when `bundles` is empty |

```ts
// The rest node of the splash.
export const splashWait = defineNode({
  outcomes: { progress: type<{ pct: number }>(), ready: type() },
  rest: true,
  inbox: ["progress", "ready"]
});
```

## Rules

- The overall fraction is the mean over the configured bundles. One bundle is `loaded / total` of its files.
- A bundle that is not in `bundles` is ignored.
- A bundle with `total: 0` counts as loaded.
- The inbox keeps one entry per type, so an event posted before the splash rests is not lost.

## Files

| File | Holds |
|---|---|
| `index.ts` | The wiring: `depends`, the config defaults, the two hooks, `onStart` |
| `types.ts` | `Config`, `State` |
| `state.ts` | `createLoadProgressState(config)`: every configured bundle at zero |
| `handlers.ts` | `onStart`, `onBundleProgress`, `onBundleLoaded`: pure functions over the state and a `post` callback |

## Limits

- The assets API has no read of the manifest's bundle list, so the plugin cannot check `bundles` at run time.
  The type does: `BundleKey` is written by the same `bun run keys` as the manifest, so a name the game does not
  have does not compile.
- A configured bundle that nothing loads, such as a `lazy` one nobody asks for, never posts `ready`.
- An app whose assets plugin runs without `io` sends no asset event. `ready` is then posted only when
  `bundles` is empty.
