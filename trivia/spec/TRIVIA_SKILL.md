---
name: trivia-question-generator
description: >
  Generates trivia categories and questions for the Moku Room "Trivia" game.
  Produces interesting, varied, multi-language (English + Russian required) questions
  across text and image types, graded by difficulty, quality-checked by review agents,
  with answers obfuscated in the output. This file is a STARTER SKELETON — an agent
  should extend and refine it.
  INVOCATION: this skill is run ONLY via the slash command `/trivia-gen` (see below).
---

# Trivia Question Generator (skeleton)

> This is a starting point, not a finished skill. Fill in the gaps, add detail,
> and expand the category bank and quality rules as you go.

## Goal

Generate trivia content that is **genuinely fun to play** — not a dry textbook quiz.
The single most important quality bar: **questions should be interesting, surprising,
and varied.** Boring, predictable, or repetitive questions are failures even if factually correct.

## Invocation (required)

This skill is **only** invoked through a slash command — never run ad hoc.

- **Command:** `/trivia-gen`
- It must be called explicitly; the generator should not be triggered by anything else.
- Suggested arguments (agent to finalize):
  - `lang` — target language(s), e.g. `en`, `ru` (Russian required in the overall pool).
  - `count` — how many questions to generate.
  - `categories` — optional list to focus on (otherwise pull a varied spread from the bank).
  - `difficulty` — optional tier filter, otherwise balanced across easy/medium/hard.
- Example: `/trivia-gen lang=ru count=20 difficulty=mixed`

> Agent: define the exact command name, argument schema, and defaults, and document
> them here. Keep the rule that generation happens ONLY via this slash command.

## What "interesting, not dull" means

- **Surprise over recall.** Favor questions with a satisfying "huh, really?" payoff over
  pure date/capital memorization. A good question teaches something while being asked.
- **Wide spread of themes.** Don't cluster around geography + history. Pull from many worlds.
- **Mix the familiar and the unexpected.** Some warm, recognizable questions; some delightfully obscure.
- **Concrete and vivid.** "Which animal can survive being frozen solid and thaw back to life?"
  beats "What is a notable amphibian adaptation?"
- **Fun wrong answers.** Distractors should be plausible and sometimes funny — never throwaway.
- **No filler.** If a question feels like it could appear in any generic quiz, regenerate it.

## Category bank (seed — expand this heavily)

Aim for breadth. Rotate so a match feels varied. Starter buckets:

- Science & Nature, Space, The Human Body
- History & "On This Day", Ancient World
- Geography, Flags, Landmarks
- Movies & TV, Music, Video Games
- Art & Architecture, Literature
- Food & Drink, Around the World
- Sports & Games, Olympics
- Technology & Internet, Inventions
- Mythology & Legends, Religion & Belief
- Animals (Weird & Wonderful), Plants & Fungi
- Language & Words, Etymology
- Pop Culture & Memes, Brands & Logos
- "Strange but True", World Records, Hoaxes & Mysteries
- Numbers & Math (playful), Money & Economics

> Agent: add many more, and consider sub-categories and seasonal/topical sets.

## Languages

- **English** is the primary language.
- **Russian is required** — generate genuine Russian questions, not machine translations.
  Cultural fit matters: a Russian-language set can lean into topics that resonate locally.
- Other languages are allowed; always tag each question with its language.

## Question types

- **Text** — a prompt with four options.
- **Image** — a real image from the internet (prefer stable, reusable sources such as
  Wikimedia Commons). The image must clearly support the question, and the review step
  must confirm the URL resolves and the answer genuinely matches the picture.

## Difficulty

Three tiers — easy → medium → hard — so a 12-round match can ramp up gradually.
Difficulty should come from the *question*, not from trick wording. Calibrate honestly:
"easy" = most casual players get it; "hard" = rewarding for enthusiasts, still fair.

## Each question must have

- A stable `id` (used so the same question is never repeated to a group).
- `category`, `lang`, `difficulty` (tier), `type` (`text` | `image`).
- A clear prompt, exactly **four** options, exactly **one** correct answer.
- For image questions: a validated `imageUrl`.
- The correct answer stored **obfuscated** (see below).

## Quality review (agents)

After generation, review agents check every question and reject/repair anything that fails:

- **Factually correct** and current.
- **Exactly one** defensible right answer; no ambiguity, no two-true-answers.
- **Plausible distractors** — wrong but believable, ideally interesting.
- **Difficulty fits** its assigned tier.
- **Language quality** — natural, idiomatic (especially Russian).
- **"Is it actually fun?"** — flag dull/generic questions for regeneration.
- **Image questions**: URL loads, image is unambiguous, answer matches.
- **No accidental duplicates** in meaning across the set.

> Agent: define the agent roles and the pass/fail loop in detail.

## Answer obfuscation (anti-spoiler, NOT security)

Purpose: so whoever browses the generated files can't read the answers at a glance.
This is not real secrecy — anything client-side is inspectable.

- Store the correct answer in an obfuscated field rather than as plain text/index.
- Make identical answers encode differently (e.g. add a random salt) so duplicates aren't obvious.
- The game decodes it only at grading time.

> Agent: pick and document the exact obfuscation scheme.

## Output

- Write questions to the game's question file(s).
- Balance the spread across tiers so full 12-round matches can be assembled.
- Don't repeat content already present in the existing pool.

## Example questions (shape + the "interesting" bar)

These show the target tone — varied, vivid, with a payoff:

- "Which animal can survive being frozen solid and then thaw back to life?"
  → Wood frog, Arctic fox, Snow hare, Reindeer.
- "Honey never spoils. Archaeologists found edible honey in tombs roughly how old?"
  → 300 years, 1,000 years, 3,000 years, 10,000+ years.
- "Какой музыкальный инструмент изначально изобрели для… механической подачи воздуха?"
  → expand with a vivid, surprising fact.
- (image) A close-up of an everyday object at extreme zoom: "What is this?"
- (image) A national flag most people misidentify: "Which country?"

> Agent: replace these with a full, validated, well-graded set.
