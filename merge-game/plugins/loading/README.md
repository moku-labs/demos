# loading

Loads the bundles of its config (`bundles`) and reports how far they came.
A plugin hears engine events and a node cannot, so the plugin posts world events into the flow
inbox and the rest node of the splash takes them.

| Inbox event | When |
|---|---|
| `progress` `{ share }` | The share of the bundles moved. `share` is 0..1 on two decimals. |
| `loaded` | Once, when the last of them is loaded. At once when there is none. |
| `failed` | The first failed load since the last retry. |

`loaded` follows `assets:bundle-loaded`, never `loaded === total`: a failed file counts as settled
in the progress. A failed load is logged as `merge-game: a bundle of the splash failed`.

## Config

| Key | Type | Default | What |
|---|---|---|---|
| `bundles` | `readonly string[]` | `[]` | The bundles to load and wait for. With none, `loaded` goes out at once. |
| `retry` | `{ node: string; outcome: string }` | none | The flow edge that loads the failed bundles again, from an empty share. Left out, no edge retries. |

```ts
pluginConfigs: {
  loading: { bundles: ["home", "board", "orders"], retry: { node: "splash", outcome: "retry" } }
}
```

## Events

- Hears `assets:bundle-progress`, `assets:bundle-loaded` and `flow:edge`.
- Posts `progress`, `loaded` and `failed` into `flow.inbox`. Emits no event of its own.

## Files

- `index.ts` — the plugin: the hooks, the first loads in `onStart`, the retry.
- `state.ts` — the loading state and its pure functions.
- `types.ts` — `LoadingConfig`, `RetryTrigger`.
