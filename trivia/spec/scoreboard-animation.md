# Scoreboard animation — the transition schema (authoritative)

The TV interstitial scoreboard (A7) animates the standings after every round: first the round's
gains (the "+N" chip + count-up), then any rank change (the FLIP slide). This document is the
**single source of truth** for that animation: the derivation model, the invariants, and the
**exhaustive case matrix** every implementation change must keep green. Each case `S#` maps to a
unit test, an e2e test, and a recorded review artifact.

> **History (why this spec exists).** The board previously conflated two different notions of
> "rank": the synced `rank` field (a *competition* rank — ties share a number — recomputed by the
> host at **every award**, so already final by scoreboard time) was used as the row's *previous
> display position*. Two players with equal totals therefore got the **same slot** (rows rendered
> on top of each other), and in the no-tie case `prev == final` meant **no overtake ever animated**.
> Both bugs shared that one root cause.

## 1. The model — everything derives from one synced snapshot

The board **never trusts the synced `rank`/`prevRank` fields and keeps no client-side memory.**
Every render derives the full before/after geometry from `players` (roster, join order) and
`scores` (`total` + `delta`) — the same fields the count-up already uses. Because `delta` is
zeroed when each question goes live (`clearDeltas`), during the scoreboard phase
`total − delta` is **exactly the board as it stood after the previous round**, on every device,
after any refresh or reconnect.

Derivation (pure, in `src/lib/leaderboard.ts` → `boardRows()`):

1. **Merge zero rows** — every *connected* roster player with no score entry joins at
   `total 0, delta 0` (a player in the game always appears).
2. **Resolve profiles** — a row whose player has left the roster is dropped (leavers vanish);
   a *disconnected* player who scored keeps their row (they're still in the match).
3. `preTotal := total − delta` per row.
4. **identity** := the player's index in the roster (join order) — the deterministic, score-free
   tiebreak.
5. **`prevPosition`** := index in sort by `(preTotal desc, identity asc)` — the slot the row held
   **before** the round. Unique 0-based.
6. **`position`** := index in sort by `(total desc, prevPosition asc)` — the slot **after** the
   round. Unique 0-based. Tiebreak by `prevPosition` is the **exceed rule**: equal totals never
   reorder — you must *pass* a score to pass the player (§I2).
7. **`rankLabel` / `prevRankLabel`** := *competition* ranks (ties share the number: 1, 2, 2, 4)
   over the post/pre orderings. Labels are display-only — **layout never uses them**.
8. `climb := prevPosition − position` (positive = moved up).

The FLIP itself measures real DOM geometry (per-tile heights + the list's row gap), computes each
tile's pre-round `offsetTop` by replaying the heights in `prevPosition` order
(`flipSeedOffsets()` in `src/lib/board-motion.ts`), seeds `translateY(preTop − postTop)`, and
transitions to `translateY(0)`. No equal-row-height assumption.

## 2. Choreography (unchanged timing)

`useScoreboardChoreography` sequences three phases, exposed as `data-choreography` on the
scoreboard root:

| Phase | Time | Board geometry | Rank label | +N chip | ▲ overtook badge |
|---|---|---|---|---|---|
| `delta` | 0 → 1450 ms | rows held at **prevPosition** | `prevRankLabel` | visible, count-up runs | hidden |
| `reorder` | 1450 → 2050 ms | rows slide to **position** (600 ms) | `rankLabel` | visible | pops on movers |
| `settled` | 2050 ms → | rows at rest (`translateY(0)`) | `rankLabel` | visible | visible on movers |

`prefers-reduced-motion` collapses straight to `settled` (final order, final labels, no motion) —
including when the preference flips **mid-flight** (transforms snap, never stick).

## 3. Invariants (every case asserts these)

- **I1 — no overlap, ever.** `position` and `prevPosition` are each a permutation of `0..N−1`;
  at any instant of any phase, no two tiles occupy the same slot. (The reported critical bug,
  made impossible by construction.)
- **I2 — exceed rule.** Equal totals never swap: a challenger who *ties* a score does not pass
  the player; within a tie group the pre-round order persists (initially: join order).
- **I3 — derived memory.** `prevPosition` comes from `total − delta`, not stored state — the
  overtake animates identically after a TV refresh, a reconnect, or a late remount.
- **I4 — honest labels.** Rank numbers use competition ranking (tied players share the number);
  the label flips `prevRankLabel → rankLabel` exactly when the row starts moving.
- **I5 — single settle.** Each round plays the choreography once: seed → slide → rest. Skip
  paths (reduced-motion flip, phase re-entry, unmount) always end with explicit
  `transform: translateY(0)` / `transition: none` — no stuck transforms.
- **I6 — determinism.** The same snapshot renders the same board (order, labels, geometry) on
  every device and every mount.

## 4. The case matrix

Player shorthand: `A, B, C…` in roster (join) order. Each case lists the synced snapshot
(`total(delta)`) and the expected animation. **Unit** = `tests/unit/leaderboard.test.ts`,
**e2e** = `tests/e2e/scoreboard-animation.spec.ts`, artifacts under
`.planning/review/scoreboard-anim/<case>/`.

| # | Situation | Snapshot (total(delta)) | Pre order | Post order | Expected motion |
|---|---|---|---|---|---|
| S1 | Single overtake | A 300(0), B 400(200), C 100(0) | A,B,C | B,A,C | B slides 2→1; A slips 1→2; badge "▲ overtook A" on B |
| S2 | Multi-slot climb | A 300(0), B 250(0), C 500(400) | A,B,C | C,A,B | C slides 3→1 (two slots); A,B each slip one |
| S3 | Gain, no change | A 500(100), B 300(0) | A,B | A,B | no motion; A shows +100 & count-up only |
| S4 | **Tie formed — no swap** | A 400(0), B 400(300) | A,B | A,B | **no motion, no overlap**; labels become 1,1 (exceed rule: tie ≠ pass) |
| S5 | Tie broken | A 400(0), B 500(100) — were tied 400=400 | A,B | B,A | B slides 2→1 past former tie partner |
| S6 | Multi-way tie board | A 200(0), B 200(0), C 200(0) | A,B,C | A,B,C | zero motion; three distinct slots; labels 1,1,1 |
| S7 | Multi-mover (open steal) | A 100(0), B 240(140), C 180(80), D 60(60) | A,B,C,D* | B,C,A,D | B & C climb past A simultaneously; distinct slots throughout; **both** badges read "▲ overtook A" (a badge names a player actually passed — never a fellow climber) |
| S8 | Climb *into* a tie group | A 400(0), B 400(0), C 400(250) | A,B,C | A,B,C | no motion (C reached, not exceeded); labels 1,1,1 |
| S9 | Movement above zero rows | A 0(0), B 200(200), C 0(0) | A,B,C | B,A,C | B climbs out of the all-zero group; zero rows keep relative order |
| S10 | Nobody scored | A 300(0), B 200(0) | A,B | A,B | fully static board (no chips, no motion) |
| S11 | Mid-match joiner | A 300(0), B 100(0), J zero-row | A,B,J | A,B,J | J appears at the bottom with **no phantom slide** |
| S12 | Reduced motion | any of S1–S9 | — | post | instant `settled`: final order/labels, `transform: none/0` |
| S13 | Mid-flight interrupt | S1 while `reduce` flips on at ~1600 ms | — | post | transforms snap to rest; nothing sticks between slots |
| S14 | Leaver's row drops | A 300(0), B 400(200) *left roster*, C 350(300) | A,C | C,A | B's row absent; C still slides past A; positions contiguous, no gaps |

*S7 pre order: pre-totals A 100, B 100, C 100, D 0 — the three-way tie at 100 resolves by join
order (A,B,C), D last → `A,B,C,D`; post totals 240/180/100/60 → `B,C,A,D`.

Every e2e case asserts, at **both** the `delta` hold and after `settled`:
tile count, DOM order, per-tile `data-position`/`data-prev-position`, pairwise-disjoint
bounding boxes (I1), rank labels (I4), and badge visibility (§2).

## 5. Sound & siblings

- The scoreboard-entry overtake whoosh (`lib/sound/director.ts`) pitches by the **same derived
  climb** (`maxClimb` over `boardRows`), so audio matches what the eye sees — including multi-award
  steal rounds where the synced `prevRank` field only reflected the last award.
- The phone final card (A15) shows the **competition** place ("You came 1st!" for both tied
  leaders) via the same labels helper. The podium (A8) remains positional (three physical
  blocks; tie display there is out of scope).
- The synced `rank`/`prevRank` fields still exist on the wire (the host publishes them;
  nothing on the TV board consumes them anymore).

## 6. Review artifacts

`bun run test:e2e -- scoreboard-animation` covers the matrix headlessly. The capture tool
(`tests/e2e/tools/capture-scoreboard-anim.ts`) replays each case **with motion enabled** and
writes per case: `frame-1-delta.png`, `frame-2-mid-reorder.png`, `frame-3-settled.png`, and
`clip.webm` (plus `.gif` when ffmpeg is available), indexed by
`.planning/review/scoreboard-anim/index.html` — the human sign-off pack for this spec.
