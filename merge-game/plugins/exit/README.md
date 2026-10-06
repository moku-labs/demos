# exit

Answers the `exit` effect: a node asks with `fx({ kind: "exit" })`, and the plugin calls the `exit`
the app passed. The Leave popup uses it. A node has no platform in its context, so the one line
that leaves lives here.

## Config

| Key | Type | Default | What |
|---|---|---|---|
| `exit` | `() => void` | does nothing | Leaves the app. The web page and the native app pass the provider's `exit()`. |

```ts
pluginConfigs: { exit: { exit: () => platform.exit() } }
```

## Effects and events

- Handles the effect kind `exit`. Not in a fast walk: restoring a save never closes the app.
- Emits no event.
