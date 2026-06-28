---
name: trivia-gen
description: >
  Generate validated, genuinely-fun EN+RU trivia questions for the Moku "Trivia" couch-multiplayer demo.
  A multi-agent pipeline — generate (one author per language×category) → 5-lens review (facts /
  single-answer / fun / language / content-rules) → repair loop → deterministic encode — that writes the
  obfuscated bank to bank/{lang}/{category}.json (the web `collection` source the build emits to
  dist/client/bank/**). Hard content rules: globally-known only, NO Russia or USSR at all (even world-famous
  canon), include world-known Ukraine, modern as well as classic, and no single-subject over-representation.
  INVOKED ONLY via the /trivia-gen slash command; never run automatically and never write questions by hand.
---

# trivia-gen — the Trivia question-bank generator

This skill is the finished implementation of the pipeline sketched in
[`spec/TRIVIA_SKILL.md`](../../../spec/TRIVIA_SKILL.md). It generates the question bank the game loads at
match start (`questionBank.load(lang)` → the web `collection` provider fetches `/bank/{lang}/{category}.json`).

> **Invocation rule (hard):** generation runs **only** when the user types `/trivia-gen`. The command
> (`.claude/commands/trivia-gen.md`) carries `disable-model-invocation: true`, so it cannot be triggered
> automatically. Do **not** start this pipeline from any other prompt, and never edit `bank/**` by
> hand — always go through the encoder so ids and answer obfuscation stay correct.

## Default behaviour — additive top-up (never replace)

**`/trivia-gen` with no arguments ADDS ~10 new questions to every category, in both languages, keeping all
existing questions.** It reads the live category pool from `src/config.ts` (`TRIVIA.categories` — 20 today),
authors `count` (default **10**) genuinely-new questions per (category, language) spread across the tiers,
and the encoder **merges**: every existing shard is kept byte-for-byte and only new questions are appended.
**Duplicates are eliminated** at two layers — the review lens drops re-worded near-duplicates by meaning, and
the encoder drops exact duplicates by content-addressed id (`dedupeRaw`), so a question is never double-added
and re-running is a clean no-op. A bare run therefore grows the bank (e.g. ~12 → ~22 per category/language).

To **remove** specific questions (excluded subjects like Russia/Soviet content, over-represented topics like
Tetris, or duplicates), prune them by id with [`prune-bank.ts`](./prune-bank.ts) — it deletes whole
questions while keeping every survivor (and its answer obfuscation) **byte-for-byte**, and refuses to breach
the per-tier floor. To **rebuild** a shard from scratch instead, add `--replace` to the encode step. Those
two are the only sanctioned ways an existing question leaves the bank — **never hand-edit `bank/**`**.

## The one quality bar that matters

**Questions must be genuinely fun — interesting, surprising, varied.** A factually-correct but dull
question is a failure. Favour a satisfying "huh, really?" payoff over rote recall; spread themes widely;
mix the familiar with the delightfully obscure; make distractors plausible and sometimes funny. If a
question could appear in any generic quiz, regenerate it. See `spec/TRIVIA_SKILL.md` for the full ethos
and worked examples.

## Content rules (hard constraints — every question must pass)

Beyond "genuinely fun," every authored question must clear these five gates. The review pass (step 2)
enforces them; a question that fails is rewritten or dropped, never shipped. They are also why the bank is
periodically pruned (see [`prune-bank.ts`](./prune-bank.ts) in step 4).

1. **Globally known — no niche/local references.** The subject must be recognizable to a curious adult
   *anywhere in the world*, not just one country's audience. Favour globally-shared culture, science,
   nature, geography, history, and sport. Reject anything whose answer only a single national audience would
   know — if you'd have to grow up in one specific country to have a fair shot, cut it.

2. **No Russia, no USSR — zero exceptions, even world-famous.** Never author a question whose subject or
   correct answer is Russian culture, history, people, places, products, or the Soviet/USSR state — **not
   even globally-canonical ones.** This is an **absolute exclusion**, not a "keep it rare" budget. Explicitly
   **out, however world-famous:** Russian literature (Tolstoy, Dostoevsky, Pushkin, Chekhov, …), classical
   music (Tchaikovsky, Stravinsky, Rimsky-Korsakov, …), Russian art and craft (Fabergé, matryoshka, Rublev,
   the avant-garde), Mendeleev and Russian/Soviet inventors, the USSR space programme (Gagarin, Sputnik,
   Laika, Mir, Soyuz, …), tsars and Russian history (Peter, Catherine, the Decembrists, 1812, …), Russian
   folklore (Koschei, Ilya Muromets, the Firebird), the Russian language / alphabet itself, and
   "Russia = largest country / most time zones." If a question only works because the player knows something
   Russian or Soviet, cut it. **Only tolerated:** Russia as one *wrong distractor*; and the ordinary Russian
   words `космонавт` (astronaut) and `спутник` (moon / satellite) used for **universal** space science that
   is *not* about the Soviet programme (e.g. "which planet's largest moon is Titan?"). **Russian stays a
   supported game language** — this bars Russia/USSR *content*, never the `ru` locale: author RU questions
   about the wider world.

3. **Include Ukraine — when also world-known.** Actively add Ukraine-specific questions whose subject is
   *also* internationally recognized, framed as Ukrainian where accurate: Chornobyl (the 1986 disaster + the
   "Chernobyl" series), Kyiv and Kyivan Rus, borscht (the UNESCO-listed Ukrainian dish), the Tryzub and
   vyshyvanka, and world-famous Ukrainians — the Klitschko brothers (boxing), Andriy Shevchenko (football),
   Serhii Korolov (chief rocket designer, b. Zhytomyr), Kazimir Malevich and Igor Sikorsky (b. Kyiv), Milla
   Jovovich — several of them routinely *miscredited* to Russia or "the USSR"; reclaim them as Ukrainian
   where the facts support it. The asymmetry is deliberate: **Ukraine = include (when world-known); Russia =
   exclude entirely.** RU-language shards especially should carry this content. Verify the Ukrainian
   attribution with the Facts lens — don't invent or assume it.

4. **Modern, not just old — span the eras.** A shard must not feel stuck in the 20th century. Deliberately
   mix timeless classics with **contemporary** culture from the last ~10–15 years: streaming-era films and
   series, current musicians, recent video games, modern tech / apps / devices, recent science and space
   missions, current sport, and 21st-century world events and figures. Rough calibration: for the
   fast-moving categories (`movies-tv`, `music`, `video-games`, `tech`, `sports`) aim for **at least a
   third** of newly-added questions to reference the recent decade. Keep every fact current and verifiable.

5. **Don't over-represent one subject (dedup by topic, not just by prompt).** No single named work, person,
   or franchise may dominate a shard. Before adding, scan the existing prompts (you already read them to
   avoid duplicates) for the same entity; if it's already covered, only add a *genuinely distinct* angle —
   otherwise choose a different subject. **Cap: ≤ 2 questions on any one specific subject per (category,
   language).** Tetris is the cautionary tale: the bank once held seven near-identical Tetris/origin
   questions and now keeps just two distinct *gameplay* ones. The encoder catches exact-prompt duplicates by
   id; catching topic over-representation and rewordings is the author's and reviewer's job.

## Arguments (all optional)

`/trivia-gen [lang=en|ru|all] [count=N] [categories=a,b,…] [difficulty=easy|medium|hard|mixed]`

| Arg | Default | Meaning |
|-----|---------|---------|
| `lang` | `all` | `en`, `ru`, or `all` (both). Russian is **required** in the overall pool. |
| `count` | `10` | **New** questions to ADD per (category, language), spread across the tiers (or all in the chosen tier when `difficulty` is a single tier). Added on top of what's already there. |
| `categories` | all (20) | Comma list of ids from `TRIVIA.categories`; otherwise every category. |
| `difficulty` | `mixed` | A single tier, or `mixed` (all three — the normal case). |

Examples: `/trivia-gen` (add ~10 new to **all 20**, both languages, keep existing) ·
`/trivia-gen lang=ru categories=space,music count=6` (add 6 each to two RU categories) ·
`/trivia-gen difficulty=hard count=5` (add 5 hard questions to every category) ·
`/trivia-gen categories=geography,history count=12` (top up just two categories). To **rebuild** a category
from scratch (drop old questions), the encode step takes `--replace` — see step 4.

## Fixed data contract (read from `src/config.ts`)

- **Categories (20, ids):** the full `TRIVIA.categories` pool (the single source of truth — read the ids +
  display names + emoji straight from `src/config.ts`, do **not** hard-code them here). As of this writing:
  `animals`, `space`, `movies-tv`, `food`, `strange`, `music`, `geography`, `history`, `science`, `sports`,
  `video-games`, `art`, `books`, `tech`, `mythology`, `nature`, `human-body`, `inventions`, `ocean`, `cars`.
  The picker offers a random `TRIVIA.offerCount` (6) of these each round, so **every** category needs a
  full, fun bank — there are no "minor" categories.
- **Languages (2):** `en`, `ru`. RU must be **native, idiomatic Russian** — author it RU-first, never a
  machine translation of the EN set. It draws on **globally-shared** culture (and world-known Ukraine), not
  Russia-centric local topics — the **Content rules** above bind both languages equally. (`ru` is the
  language; it is **not** a licence for Russia-subject content.)
- **Tiers (3):** `easy` → `medium` → `hard`. Difficulty must come from the *question*, not trick wording.
  `easy` = most casual players get it; `hard` = rewarding for enthusiasts, still fair. A 12-round match
  ramps easy(1–4) → medium(5–8) → hard(9–12).
- **Type:** v1 is **`text` only** (a prompt + four options). `image` questions (an external `imageUrl`)
  are **phase 2** — the encoder supports the field but the starter bank must not use it.

### Sizing

Each call **adds `count` new questions per (category, language)** (default **10**), spread across the three
tiers (e.g. 4 easy / 3 medium / 3 hard) so the easy→hard ramp stays balanced — the additions accumulate on
top of whatever the shard already holds. The encoder enforces a **per-tier floor** on the *resulting* shard
(`--min 4`, i.e. ≥ 4 per tier ⇒ ≥ 12 per category/language), which a topped-up shard always satisfies.

More questions is strictly better: a bigger bank means a 12-round match always assembles from any offered
subset and **does not repeat across replays** for a group (the no-repeat key is the per-question id, unioned
across the group and persisted per-phone — and ids are stable, so a top-up never disturbs that history). The
game tolerates a category whose shard isn't generated yet (it's simply never offered), so a brand-new
category can be filled by an additive `/trivia-gen categories=…` run.

## RAW question shape (what the author/review agents write)

Agents write **raw** questions — plaintext, no ids, no obfuscation. The encoder derives everything else.
One JSON array per shard at `scratchpad/raw/{lang}/{category}.json`:

```json
[
  {
    "tier": "easy",
    "type": "text",
    "prompt": "Which animal can survive being frozen solid and then thaw back to life?",
    "options": ["Wood frog", "Arctic fox", "Snow hare", "Reindeer"],
    "correctIndex": 0
  }
]
```

Rules: exactly **4** options; exactly **one** correct (`correctIndex`, 0–3); no duplicate options; non-empty
prompt. `category` and `lang` come from the file path — do **not** repeat them per question. **Never write
`id`, `answerCheck`, or a shuffled order by hand** — the encoder owns all three (it computes the sha256 id,
shuffles slots deterministically, and salts the correct slot).

## Pipeline

### 1 — Generate (fan-out: one author per language × category)

Spawn one author agent per requested `(lang, category)` (up to **40** for a full run — 20 categories × 2
languages). Each authors `count` (default 10) **new** questions to `scratchpad/raw/{lang}/{category}.json` in
the RAW shape above, spread across the tiers. Give every agent: the category id + display name + emoji, the
language (RU-first for `ru`), the tier calibration, the "genuinely fun" bar, the **Content rules**
(globally-known only · no Russia · include world-known Ukraine · modern as well as classic · no
single-subject over-representation), the exactly-4-options / one-correct / plausible-distractors rules, and
the output path.

**Avoid duplicates (additive runs):** the agent MUST first read the category's **existing** prompts from
`bank/{lang}/{category}.json` and author questions that are new *in meaning* — not a reworded version of one
already there. The encoder is an exact-prompt safety net (it silently drops a question whose normalized
prompt already exists), but it cannot catch a paraphrase, so semantic novelty is the author's job. Pass the
agent the list of existing prompts for its shard.

### 2 — Review (fan-out: 5 lenses, one reviewer per category covering both languages)

Independent reviewers re-check every question against five lenses and rewrite or replace any that fail,
emitting polished shards to `scratchpad/final/{lang}/{category}.json`:

1. **Facts** — correct + current; verify dubious claims (WebSearch), incl. any Ukrainian attribution.
   Reject the unverifiable.
2. **Single answer** — exactly one defensible correct option; no two-true-answers, no ambiguity.
3. **Fun** — flag dull/generic/predictable questions for regeneration; ensure plausible, interesting distractors.
4. **Language (+ image)** — natural, idiomatic phrasing (scrutinise RU especially); for any phase-2 image
   question, confirm the URL resolves and the picture unambiguously supports the answer.
5. **Content rules** — enforce the five hard constraints above: drop anything not **globally known**; drop
   **every** Russia-subject / Russia-answer / Russian-culture / USSR question with **no exception** (even
   world-famous canon — Tolstoy, Tchaikovsky, Gagarin, Mendeleev all OUT); confirm any **Ukraine** content
   is also world-known and correctly attributed; check the shard carries
   enough **modern** (last ~10–15 yr) content, especially in the fast-moving categories; and flag
   **single-subject over-representation** (> 2 questions on one named work/person/franchise per shard).

Also dedupe by *meaning* within and across shards — including topic over-representation, not just exact
rewordings (the encoder dedupes only exact-prompt id collisions).

### 3 — Repair loop

Re-review anything a reviewer rewrote until a clean pass (no factual/ambiguity/dullness flags remain).

### 4 — Encode + write (deterministic — the only writer of `bank/**`)

Run the skill's encoder over the reviewed shards. The source shards hold **only the new questions** — the
encoder reads the existing `bank/` shard itself and keeps it:

```sh
bun .claude/skills/trivia-gen/gen-bank.ts --source scratchpad/final --out bank --min 4
```

**Merge is the default (add, never replace).** For each shard the encoder keeps every existing question
**byte-for-byte** and appends only the genuinely-new ones, dropping any whose content-addressed id already
exists (`dedupeRaw`). So the source only needs the questions you're adding; existing ones are preserved from
`bank/` directly. The run prints `+new` / `dup` columns and an `N added · M duplicate(s) skipped` total.

**Scope — `--categories`.** The encoder requires a source shard for every category it processes (it fails on
any missing). When you authored only a subset (the `categories=` argument), pass the **same** subset so it
touches only those shards and leaves the rest of `bank/` exactly as they are:

```sh
# add to only the listed categories — every other shard in bank/ is untouched
bun .claude/skills/trivia-gen/gen-bank.ts --categories geography,history,ocean --source scratchpad/final --out bank --min 4
```

**Rebuild — `--replace`.** To rebuild a shard from its source alone (the destructive path — questions absent
from the source are dropped), add `--replace`. Use it to retire or fix many questions at once, never for a
routine top-up:

```sh
bun .claude/skills/trivia-gen/gen-bank.ts --categories animals --source scratchpad/final --out bank --min 4 --replace
```

**Remove — `prune-bank.ts`.** To retire a *handful* of specific questions (an excluded subject, an
over-represented topic, an exact/near duplicate) without re-authoring the shard, prune them by id. Unlike
`--replace` (which re-shuffles every kept slot from RAW), pruning deletes whole encoded questions and leaves
every survivor — id, options order, and salted `answerCheck` — **byte-for-byte identical** (the diff is pure
deletions), so the no-repeat history and `decode()` grading contract are preserved untouched. It fails
loudly if any requested id is missing or if a removal would drop a `(category, tier)` bucket below `--min`
(top that tier up via a normal `/trivia-gen` run first, then prune):

```sh
# structured: JSON { "en": { "video-games": ["45f6be053244"] }, "ru": { "cars": ["b16e20fc447c", …] } }
bun .claude/skills/trivia-gen/prune-bank.ts --ids-file scratchpad/remove-ids.json --out bank --min 4
# flat: remove globally-unique ids from whatever shard holds them
bun .claude/skills/trivia-gen/prune-bank.ts --ids 18a96d53506c,45f6be053244 --out bank --min 4
```

Unknown ids fail loudly (a typo can't silently skip a shard). Omit `--categories` for the whole pool. The
encoder computes each `id = sha256(lang|category|normPrompt).slice(0,12)`, deterministically shuffles the
option slots, salts the correct slot into `answerCheck`, and **fails loudly** unless every id is globally
unique, every `answerCheck` round-trips through `src/plugins/question-bank/decode.ts`, and every
`(category, tier)` meets the floor. Pure transforms live in [`bank-encode.ts`](./bank-encode.ts); the runtime
decoder is [`src/plugins/question-bank/decode.ts`](../../../src/plugins/question-bank/decode.ts). It is
**idempotent**: stable ids mean re-running an additive top-up adds nothing the second time and yields
byte-identical files (clean git diffs).

### 5 — Verify

`bun run test` (the encoder + bank tests stay green) and `bun run build` (confirm the new shards are
emitted by the `collection` provider into `dist/client/bank/**` — what the worker serves as `ASSETS`).

## Answer obfuscation (anti-spoiler, NOT security)

The correct answer is stored only as `answerCheck = "${salt}:${(correctSlot + salt.length) % 4}"` — never
as a plaintext index. Salts vary in length per question, so two questions whose correct answer lands in the
same slot encode differently and the bank doesn't betray its answers at a glance. This is obfuscation for
casual readers, not real secrecy (anything client-side is inspectable). The game decodes it only at grade
time via `src/plugins/question-bank/decode.ts`. The scheme is owned entirely by the encoder — never reproduce it by hand.

## Output

- `bank/{lang}/{category}.json` — an array of encoded questions per shard (the `collection` source; the
  build emits it to `dist/client/bank/**`, served from `ASSETS`).
- Keep the spread balanced across tiers so full 12-round matches assemble; don't repeat existing content
  (stable ids make re-adding a no-op).
