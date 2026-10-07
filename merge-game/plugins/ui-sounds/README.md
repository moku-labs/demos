# uiSounds

The click of every control. On start it adds one `input.onTap` listener; when the tapped view
carries `Tappable` or `LocalWrite`, it dispatches `sfx(click)` through `flow.fx`. A panel with
`Touchable` alone and a disabled control stay silent. A game without `audio` hears nothing.

Folder `ui-sounds/`, plugin name `uiSounds`.

## Config

| Key | Type | Default | What |
|---|---|---|---|
| `click` | `string` | `"ui.sounds.click"` | The asset key of the click. |

```ts
pluginConfigs: { uiSounds: { click: "ui.sounds.click" } }
```

## Effects and events

- Dispatches the effect `sfx(click)` on every tap of a control.
- Handles no effect. Emits no event.
