# locale

Answers the `locale` effect: a node asks with `fx({ kind: "locale", payload: { locale: "en" } })`,
and the plugin calls `i18n.setLocale("en")`. The settings use it. A node cannot call `i18n`, so the
one line that switches the language lives here.

## Config

None.

## Effects and events

- Handles the effect kind `locale`. A payload without a string `locale` changes nothing.
- Emits no event. `i18n` emits its own when the locale changes.
