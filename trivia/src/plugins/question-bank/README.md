# question-bank

Standard room **game plugin** (stage / host). Loads + indexes + decodes the static EN/RU question bank
(fetched from `ASSETS` at match start), selects the next unseen question for a `(category, tier)`, owns
the per-group no-repeat union (seeded by the controller-sent `seen-history` intent + every question
shown), grades a locked answer at reveal (the **only** place `correctSlot` is computed), and exposes
per-category availability for the picker UI + the category-exhausted toast.

- **Depends on:** `stagePlugin`, `syncPlugin`, `intentPlugin`
- **Slices:** `bank`, `categories`
- **Intent owned:** `seen-history`
- **API:** `load`, `next`, `grade`, `availability`

Full spec: [`.planning/specs/01-question-bank.md`](../../../.planning/specs/01-question-bank.md).
