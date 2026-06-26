---
description: Generate validated EN+RU Trivia questions into public/bank via the trivia-gen multi-agent pipeline.
argument-hint: "[lang=en|ru|all] [count=N] [categories=a,b] [difficulty=easy|medium|hard|mixed]"
disable-model-invocation: true
---

Run the **trivia-gen** skill to generate trivia questions for the Trivia demo.

This command is the **only** sanctioned entry point for question generation (it is marked
`disable-model-invocation`, so it never fires automatically — a human must type `/trivia-gen`).

Arguments (all optional, `key=value`): `$ARGUMENTS`

Follow `.claude/skills/trivia-gen/SKILL.md` exactly:

1. Parse the arguments (`lang`, `count`, `categories`, `difficulty`) against the skill's defaults.
2. **Generate** raw questions — fan out one author agent per requested `(lang, category)` →
   `scratchpad/raw/{lang}/{category}.json` (RAW shape: `tier`, `type`, `prompt`, 4 `options`, `correctIndex`).
3. **Review** with the four lenses (facts / single-answer / fun / language) and **repair** until clean →
   `scratchpad/final/{lang}/{category}.json`.
4. **Encode + write** the obfuscated bank: `bun scripts/gen-bank.ts --source scratchpad/final --out public/bank --min 4`.
5. **Verify**: `bun run test` and `bun run build`.

Never hand-write `id`/`answerCheck` or edit `public/bank/**` directly — the encoder owns ids, slot shuffling,
and answer obfuscation. Russian must be native and idiomatic, not a translation. v1 is text-only (images are
phase 2).
