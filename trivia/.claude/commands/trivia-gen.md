---
description: Generate validated EN+RU Trivia questions into the bank/ collection via the trivia-gen multi-agent pipeline.
argument-hint: "[lang=en|ru|all] [count=N] [categories=a,b] [difficulty=easy|medium|hard|mixed]"
disable-model-invocation: true
---

Run the **trivia-gen** skill to generate trivia questions for the Trivia demo.

This command is the **only** sanctioned entry point for question generation (it is marked
`disable-model-invocation`, so it never fires automatically — a human must type `/trivia-gen`).

Arguments (all optional, `key=value`): `$ARGUMENTS`

**Default (no arguments): ADD ~10 new questions to every category in `TRIVIA.categories` (`src/config.ts` —
20 today), in both languages, keeping all existing questions and skipping duplicates.** It never replaces.

Follow `.claude/skills/trivia-gen/SKILL.md` exactly:

1. Parse the arguments (`lang`, `count` [default **10**], `categories`, `difficulty`) against the skill's
   defaults. Read the category pool from `src/config.ts` (`TRIVIA.categories`).
2. **Generate** raw questions — fan out one author agent per requested `(lang, category)` →
   `scratchpad/raw/{lang}/{category}.json` (RAW shape: `tier`, `type`, `prompt`, 4 `options`, `correctIndex`).
   Each agent first reads the **existing** prompts in `bank/{lang}/{category}.json` and authors `count` NEW
   questions (new *in meaning*, not reworded), spread across the tiers.
3. **Review** with the four lenses (facts / single-answer / fun / language), **dedupe by meaning** against the
   existing bank, and **repair** until clean → `scratchpad/final/{lang}/{category}.json`.
4. **Encode + write** (merge by default — keeps existing, appends only new, drops exact-id duplicates):
   `bun .claude/skills/trivia-gen/gen-bank.ts --source scratchpad/final --out bank --min 4`.
   The source holds only the NEW questions; the encoder keeps the rest from `bank/` itself. For a **subset**
   (a `categories=` argument), pass the **same** ids so only those shards are touched:
   `… gen-bank.ts --categories <the same list> --source scratchpad/final --out bank --min 4`.
   Add `--replace` ONLY to rebuild a shard from scratch (drops questions not in the source) — never for a
   routine top-up.
5. **Verify**: `bun run test` and `bun run build`.

Never hand-write `id`/`answerCheck` or edit `bank/**` directly — the encoder owns ids, slot shuffling,
and answer obfuscation. Russian must be native and idiomatic, not a translation. v1 is text-only (images are
phase 2).
