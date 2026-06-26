# language

Standard room **game plugin** (stage / host). Runs the match-start language vote: tallies per-peer EN/RU
votes over a fixed confirm window (the "Confirming in Ns…" countdown), then resolves the match language
once (majority; `defaultLang` on tie/no-votes) and hands it back via a callback. Owns the `language-vote`
intent + the `languageVote` synced slice. `match-flow` calls `openVote(onConfirm)` when the match enters
the language-vote phase.

- **Depends on:** `stagePlugin`, `syncPlugin`, `intentPlugin`
- **Slice:** `languageVote`
- **Intent owned:** `language-vote`
- **API:** `openVote`, `cancelVote`, `result`
- **Lifecycle:** `onInit` registers slice + intent (no timer); `onStop` clears the vote timer. The timer
  handle lives in a **module closure** in `lifecycle.ts`, never `ctx.state`.

Full spec: [`.planning/specs/03-language.md`](../../../.planning/specs/03-language.md).
