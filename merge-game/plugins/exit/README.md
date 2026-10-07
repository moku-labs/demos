# exit

Answers the `exit` effect: a node asks with `fx({ kind: "exit" })`, and the plugin calls
`platform.exit()`. The Leave popup uses it. A node has no platform in its context, so the one line
that leaves lives here.

## Config

None. The platform provider comes from the shell: the native app leaves, the web page and iOS do
nothing.

## Effects and events

- Handles the effect kind `exit`. Not in a fast walk: restoring a save never closes the app.
- Emits no event.
