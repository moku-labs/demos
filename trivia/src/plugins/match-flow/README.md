# match-flow

Complex room **game plugin** (stage / host) — the match coordinator + authoritative clock. Owns the
lobby + player profiles, the 12-round loop, active-player rotation, the difficulty ramp, the **steal
state machine** (incl. the 1-player no-steal edge), the host-owned round + phase timers (absolute
`deadlineTs`), and the final / play-again flow. Coordinates the other three plugins by direct host-side
API call (`questionBank.*`, `scoring.*`, `language.openVote`).

- **Depends on:** `stagePlugin`, `syncPlugin`, `intentPlugin`, `questionBankPlugin`, `scoringPlugin`, `languagePlugin`
- **Slices:** `match`, `players`, `question`, `reveal`, `steal`
- **Intents owned:** `join-profile`, `start-game`, `category-pick`, `answer-lock`, `play-again`
- **Hooks:** `room:peer-joined`, `room:peer-left`, `room:host-reconnecting`, `room:network-warning`
- **No public `api`** — intent- + clock-driven; the podium reads `app.scoring.endStats()` directly.
- **Files:** `state.ts` (lock + tried), `handlers.ts` (`room:*`), `machine.ts` (steal machine), `clock.ts`
  (onInit + the `setInterval` closure). The clock handle lives in `clock.ts`, never `ctx.state`.

Full spec: [`.planning/specs/04-match-flow.md`](../../../.planning/specs/04-match-flow.md).
