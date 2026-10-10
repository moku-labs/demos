# flowLog

Writes every failed node of the graph into the log. The engine only emits the event `flow:error`: without this
plugin a failed transition leaves no trace, and the button that started it looks dead.

Micro tier. No config, no state, no API, no events of its own. Depends on `flowPlugin` (its event).

## Config

None. The plugin is listed and that is all:

```ts
plugins: [loadProgressPlugin, flowLogPlugin, pressBufferPlugin]
```

## What it logs

It writes through `ctx.log.error`, so the entry is in `app.log.trace()` and on the console of the page.

| Entry | Level | Data | When |
|---|---|---|---|
| `flow:error` | `error` | `{ path, rolledBackTo, retry, error: { message, stack } }` | A node failed and the graph rolled back. Once per failure |

| Key | Type | Meaning |
|---|---|---|
| `path` | `string` | The path of the node that failed, for example `round/leaveBoard` |
| `rolledBackTo` | `string` | Where the graph stands now: the last rest point, or the safe node |
| `retry` | `boolean` | `true`: the graph went back to the rest point and the transition can be tried again. `false`: the runner gave up and entered the safe node |
| `error` | `{ message, stack }` | What the node threw. The log merges it in from the `Error` |

```ts
// Leaving the Board fails twice in the middle of a round.
app.log.trace().filter(entry => entry.event === "flow:error").map(entry => entry.data);
// [
//   { path: "round/leaveBoard", rolledBackTo: "round/humanTurn", retry: true, error: { message, stack } },
//   { path: "round/leaveBoard", rolledBackTo: "home", retry: false, error: { message, stack } }
// ]
```

## Rules

- One entry per `flow:error`. A transition that fails and is retried leaves two.
- The entry has the name of the event it records, so the engine's list of events says what it holds.
- A node may throw anything. A value that is no `Error` becomes the message of a new one.
- The plugin only reads the event. It changes no state and never answers the gate.

## Files

| File | Holds |
|---|---|
| `index.ts` | The wiring: `depends` and the one hook, which binds the handler to `ctx.log.error` |
| `handlers.ts` | `onFlowError`: a pure function over the payload and a `write` callback. `FLOW_ERROR`, the name of the entry |

## Limits

- The screen app has it, `game.headless()` does not: the headless app composes the features only. A headless
  test reads a failure from the state of the graph.
- A failure inside the safe node is not an event: the runner rejects `flow.run()` with it, and the page logs
  that as `[game] The graph stopped.`
