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
3. **Review** with the five lenses (facts / single-answer / fun / language / **content-rules**), **dedupe by
   meaning** against the existing bank (including topic over-representation), and **repair** until clean →
   `scratchpad/final/{lang}/{category}.json`.
4. **Encode + write** (merge by default — keeps existing, appends only new, drops exact-id duplicates):
   `bun .claude/skills/trivia-gen/gen-bank.ts --source scratchpad/final --out bank --min 4`.
   The source holds only the NEW questions; the encoder keeps the rest from `bank/` itself. For a **subset**
   (a `categories=` argument), pass the **same** ids so only those shards are touched:
   `… gen-bank.ts --categories <the same list> --source scratchpad/final --out bank --min 4`.
   Add `--replace` ONLY to rebuild a shard from scratch (drops questions not in the source) — never for a
   routine top-up. To **remove** a handful of specific questions (excluded subjects, over-represented topics,
   duplicates) without re-authoring, prune them by id: `bun .claude/skills/trivia-gen/prune-bank.ts
   --ids-file scratchpad/remove-ids.json --out bank --min 4` (keeps every survivor byte-for-byte).
5. **Verify**: `bun run test` and `bun run build`.

Never hand-write `id`/`answerCheck` or edit `bank/**` directly — the encoder owns ids, slot shuffling, and
answer obfuscation; questions only leave via `--replace` or `prune-bank.ts`. Russian must be native and
idiomatic, not a translation, and — like English — must obey the **Content rules** in the skill: globally
known only, **NO Russia or USSR at all** (zero exceptions — even world-famous canon like Tolstoy,
Tchaikovsky, Gagarin, Mendeleev is excluded), include **world-known Ukraine**, span modern as well as
classic, and no single-subject over-representation. v1 is text-only (images are phase 2).
