# scoring

Standard room **game plugin** (stage / host). Pure host-side state transforms: awards points (correct +
steal-partial, scaled by difficulty tier), maintains running totals, per-round deltas, and rank (with
previous rank for the reorder animation), and computes end-of-match stats (most steals, highest streak,
top category per player) for the podium call-out. `match-flow` calls `award()` at every reveal and
`reset()` on play-again.

- **Depends on:** `stagePlugin`, `syncPlugin`
- **Slice:** `scores`
- **Intents / events:** none
- **API:** `award`, `reset`, `leaderboard`, `endStats`

Full spec: [`.planning/specs/02-scoring.md`](../../../.planning/specs/02-scoring.md).
