# Trivia — Game Design Spec

> The first game built on **Moku Room**.
> This doc covers **what players see and feel**: screens, UI, popups, animations, flow.
> Technical infrastructure (transport, sync, hosting) is handled by Moku.

## At a glance

A couch party quiz for **1–5 players**, **12 rounds**, ~10–15 minutes per match.
**TV is the stage**, **phones are private controllers**. Pick a category → answer
a 4-option question → score points → next player picks. If the active player
misses, the next player gets a chance to **steal**. Difficulty ramps from easy
to hard. The vibe is fast, loud, friendly — Jackbox / *Knowledge is Power* energy.

---

## Visual direction

- **Big, bold, playful.** Chunky type, high contrast, generous padding.
- **Color-coded players.** Each player gets a signature color + emoji-avatar at join time. That color follows them everywhere — their tile on the TV scoreboard, their answer buttons on their own phone, their pointer when it's their turn.
- **Two visual scales, one design language.**
  - **TV**: cinematic, designed to be read from a couch 3+ meters away. Minimal text, huge type, motion to draw attention.
  - **Phone**: thumb-first, oversized tap targets, almost no text the player has to read carefully (the TV is the source of truth).
- **Motion with meaning.** Animations always communicate state changes — never decorative for its own sake.
- **Sound is part of the design** (join chime, tick, reveal sting, win fanfare). Mutable.

---

## The two surfaces

| | TV (Host screen) | Phone (Controller) |
|---|---|---|
| Role | Shared stage everyone watches | Private controller per player |
| Reads | Question, options, timer, scoreboard, who's up | "Tap one of these four" / "Pick a category" |
| Hands? | No | Yes — all tapping happens here |
| Sound | Yes (room speakers) | Light haptics + minimal sound |

Rule of thumb: **if it's information for everyone, it lives on the TV. If it's a choice for one player, it lives on that player's phone.** Avoid duplicating.

---

## Player identity

Set at join:

- **Name** (3–12 chars, the player types it).
- **Color** (auto-assigned from a palette of 5–6 distinct hues; can be swapped if free).
- **Avatar** (pick from a grid of emoji-style icons — animal, fruit, monster, etc.).

This trio (name + color + avatar) is the player's signature in every UI from then on.

---

## Screen inventory

| # | Screen | Surface | Purpose |
|---|---|---|---|
| 1 | **Title / Lobby** | TV | Show QR, list joined players, wait to start |
| 2 | **Join** | Phone | Scan/enter code → name → avatar → color |
| 3 | **Waiting room** | Phone | "You're in. Waiting for host to start." |
| 4 | **Language pick** | TV + Phone | Group picks match language |
| 5 | **Round intro** | TV | "Round 3 of 12 — Alex picks" |
| 6 | **Category pick** | Phone (active) / TV (others) | Active player chooses category |
| 7 | **Question** | TV (prompt + options) / Phone (4 buttons) | The actual question |
| 8 | **Reveal** | TV + Phone | Right answer highlighted, points awarded |
| 9 | **Interstitial scoreboard** | TV | Quick standings between rounds |
| 10 | **Final results** | TV + Phone | Winner, podium, "play again" |
| — | Popups | Both | Disconnect, pause, leave, errors |

---

## Game flow

```
  Title/Lobby ──► Language pick ──► [Round 1..12] ──► Final results ──► (Play again ↺)
                                       │
                                       ▼
       Round intro ─► Category pick ─► Question ─► Reveal ─► Interstitial scoreboard
                                                                  │
                                                                  └─► next round
```

---

## Screens in detail

### 1. Title / Lobby (TV)

The first thing on the TV. The room is filling up; nothing has started yet.

- **Top center:** game title "Trivia" in big display type, gentle idle motion (subtle float / shimmer).
- **Center:** the **QR code** at large size, with the short room code below it in big chunky digits (`ROOM: 4F2K`) — so anyone too far to scan can type it on their phone instead.
- **Right side or bottom strip:** **Player tiles** — empty slots that fill in as people join. Each filled tile shows avatar, name, and color background. Empty slots show "Waiting…" with a soft pulse.
- **Bottom:** short helper line — "Open this URL on your phone, or scan the code."
- **Start button** appears on the **host** (first joined player's phone) once at least one player is in. Optionally: also auto-startable from a long-press on the TV (for the person who launched it).

Animations:
- QR has a faint breathing pulse (so it reads as "alive / ready").
- New player joining: their tile **pops in** with a bouncy scale + chime, a confetti puff in their color.
- Player leaves before start: tile fades out, slot becomes "Waiting…" again.

### 2. Join (Phone)

After scanning the QR (or entering the room code on a landing page).

- **Step A — Name:** big input, large keyboard, "What's your name?" One field, one Next button.
- **Step B — Avatar:** a grid of emoji-style avatars. Tapping one selects it (animated scale + ring). The chosen one floats up to a preview card at the top.
- **Step C — Color:** a row of color swatches; greyed-out swatches are already taken. Tap to claim.
- **Confirm:** the preview card (avatar + name + color background) animates into a "You're in!" state and transitions to the waiting room.

Vibe: fast, three taps, done. No forms, no validation noise. If a name/color clashes, suggest a free one inline.

### 3. Waiting room (Phone)

After joining, before the match starts.

- The player's own preview card centered, gently bobbing.
- Below it, a small list of who else has joined (avatars in a row).
- Bottom: "Waiting for host to start…" or, if this player **is** the host, a big **"START GAME"** button.
- A "Leave" link in the corner (returns to Join).

### 4. Language pick

How the group picks the match language.

**Option A — Host picks (simpler):** the host's phone shows two big buttons (`EN` / `RU` / …); their tap sets the match language. TV shows "Host is picking the language…" with a subtle anim.

**Option B — Group vote (more party feel):** every phone shows the language buttons; majority wins after a 5s timer. TV shows live vote tally with each player's avatar moving into a column.

> Pick one for v1. A is faster, B is more fun. Open design question.

### 5. Round intro (TV)

Brief, ~2 seconds, before each round.

- Full-screen takeover.
- Large: **"ROUND 3 / 12"** with the round number flipping in.
- Below: **"Alex's turn"** — Alex's avatar slides in from the side, their color washes the background.
- A short whoosh / drum sound.
- Auto-advances.

### 6. Category pick

The active player chooses a category.

**TV (everyone watches):**
- Headline: "**Alex is picking a category…**" with Alex's avatar pulsing.
- Three to five **category cards** displayed face-down (or face-up but greyed) in a row. Spotlight roams across them in idle motion.
- Other players' phones show a "waiting" state with the same category names, but greyed out and untappable.

**Phone (active player):**
- The same category cards, full-size, tappable. Each card: bold name, an icon/illustration, a one-line teaser ("Animals: weirder than you think").
- Tap → confirm beat (the chosen card scales up, others fade) → result sent.

**TV reveal:**
- The chosen card lights up, flies to center, others slide off. Category name lands in a banner across the top of the screen for the rest of the round.

> Open: do we offer ~3 categories per round (focused) or ~5 (more choice)?

### 7. Question

The core moment of the round.

**TV layout:**
- **Top banner:** category name + difficulty pips (1–3 dots/stars), round counter.
- **Center:**
  - *Text question:* the prompt in huge type.
  - *Image question:* the image fills the center; the prompt sits above as a single line.
- **Below the prompt:** the **four options**, in a 2×2 grid, each in one of four fixed colors (red / blue / yellow / green — Jackbox/Kahoot convention; high recognition).
- **Top right:** a circular **timer ring** counting down with subtle tick sounds in the last 3 seconds.
- **Top left:** small chip showing **whose turn it is** — avatar + name + "answering" (or "stealing" on the second pass).

**Phone layout (active player):**
- A 2×2 grid of four big colored buttons matching the TV's four colors. Each button shows **only the color**, optionally with a small letter/shape — no text. The player reads the option on the TV, taps the matching color on their phone. (This is the Jackbox trick: the phone stays glanceable, the TV holds the words.)
- Above the buttons: the question category and difficulty (tiny).
- A subtle countdown bar at the top edge mirrors the TV timer.

**Phone layout (non-active players):**
- Greyed-out version of the same grid; buttons inert.
- Centered text: "**Alex is answering** — if they miss it's your chance."

**Two-phase answering:**
1. **Active player's turn.** Their phone is live, others' are locked. Timer runs (e.g. 15s).
2. **Steal phase** (only if active player was wrong or timed out). The **next player in turn order** gets a shorter timer (e.g. 8s) to take a shot. Their phone unlocks; the TV chip swaps to their name with a "STEAL" tag.

> Alternative considered: everyone locks in simultaneously, only active counts unless wrong → fastest correct steal wins. More chaotic; revisit.

### 8. Reveal

When the answer is locked or time runs out.

- All four option tiles on the TV flip / pulse; the **correct one bursts** with a colored shockwave + sound sting.
- Wrong options dim.
- Above the grid: a banner — **"Correct! +200"** in the answering player's color, or **"Wrong"** in red + "Passing to Sam…" if there's a steal coming.
- The answering player's **score counter** on the side rolls up the points (rolling-number animation).
- On the answering player's **phone**: full-screen color flash — **green pulse** for correct, **red shake** for wrong. Haptic feedback. Auto-dismisses after ~1.5s.

### 9. Interstitial scoreboard (TV)

Between rounds, ~3 seconds.

- A horizontal **leaderboard** with player tiles ordered by score.
- Tiles **reorder with motion** — positions shift left/right as ranks change. The player whose score just moved gets a brief highlight glow.
- Below: "Round 4 next — Sam picks." Auto-advances.

Optional flourish: a "round MVP" call-out if someone just scored a hard correct.

### 10. Final results

End of round 12.

**TV:**
- **Podium reveal.** Bronze first, then silver, then gold (each with a beat + sound). Loser-but-honored players cluster at the side.
- **Winner takeover.** The winner's avatar/color washes the whole screen. Confetti in their color. Sound fanfare.
- Stats card optional: "Most correct steals — Alex" / "Comeback of the match — Sam" / "Highest streak — 4 (Pat)".
- Bottom: two buttons — **"PLAY AGAIN"** (same players, new questions) and **"NEW GAME"** (back to lobby).

**Phone:**
- "**You came 2nd!**" with their color + avatar.
- A "Play again" / "Leave" pair of buttons.

---

## Popups & modals

| Trigger | Where | What it shows | Resolution |
|---|---|---|---|
| Player disconnects mid-match | TV banner + their tile dimmed | "Alex dropped — waiting 30s for reconnect" with countdown | Reconnect closes it; timeout removes them and play continues |
| Player taps "Leave" | Their phone | "Leave the game?" confirm modal | Yes → exit; No → resume |
| Host pauses | TV full-screen overlay | "Paused — waiting for [name]" | Tap on host phone to resume |
| New player tries to join mid-match | Their phone | "Game in progress — you'll join the next match" | Auto-dismiss / queue |
| Category pool exhausted | TV brief notice + active player's phone | "No fresh questions in [X] — pick another" | They re-pick from remaining categories |
| Connection trouble | TV strip + affected phone | "Reconnecting…" with retry spinner | Auto-recover or fall back to "left game" |
| End-of-match recap closing | TV | "Returning to lobby in 5…" | Auto |

All popups: dim background, centered card, one or two buttons, never block the only path back.

---

## Animation catalog

Anim style: **springy**, **short** (mostly 150–400ms), **purposeful**.

| Moment | Animation | Purpose |
|---|---|---|
| QR idle | gentle breathing pulse | Looks alive, ready |
| Player joins | tile pops in + confetti puff + chime | Celebrate joiner, draw eyes |
| Round intro | numbers flip, avatar slide-in, color wash | Reset attention, hand off turn |
| Category cards idle | slow spotlight sweep | "Choose something" energy |
| Category chosen | card scales up + flies to banner | Commitment / drama |
| Question appears | prompt fades up, options stagger-fade in | Read top-down |
| Timer | ring depletes; last 3s tick + slight color shift to amber → red | Urgency without panic |
| Lock-in tap (phone) | button presses, full-screen flash in option color | Confirm input |
| Correct reveal | option bursts with colored shockwave | Payoff |
| Wrong reveal | option shake + dim | Sting (mild) |
| Points roll-up | rolling number counter on TV scoreboard | Make scoring feel earned |
| Steal handoff | turn chip slides to next player + "STEAL" tag drops in | Make the rule visible |
| Leaderboard reorder | tiles shuffle horizontally with spring | Show rank changes clearly |
| Podium | each step rises in sequence with sound | Build to winner |
| Winner reveal | full color wash + confetti + fanfare | The big payoff |

---

## Edge cases (UX)

- **Single-player mode.** No steal phase. Used for solo practice or testing — still feels like a show, not a quiz.
- **Category runs out of fresh questions for this group.** That category card is shown but marked "no new ones" and excluded from this round's choices; if all are exhausted, ask the player to allow repeats or end the match early.
- **Active player AFK.** Timeout = wrong, steal proceeds. After two timeouts in a row, soft prompt: "Still there? Tap to stay in."
- **Tied final scores.** Tie-breaker question shown — sudden death, fastest correct wins.
- **Player joins late.** Held in waiting room with a friendly "next match starts in…" once the current one ends.
- **Host leaves.** Quietly promote next player to host; small TV notice.

---

## Feel & accessibility notes

- **Readability from across the room.** Minimum effective type size on the TV: very large (think 5–8% of screen height for body, 12%+ for the question itself). Test from 3 meters.
- **Colorblind safety.** The four option colors are also paired with **shapes/letters** so red/green confusion never matters; difficulty pips use both color and count.
- **Sound mutable.** A small mute toggle in the TV corner.
- **No reading on the phone.** Players should only need to look up at the TV to read; the phone is just colored buttons. Keeps the game social.
- **No timer panic.** Timer is firm but not punishing; the last seconds shift color rather than flash aggressively.

---

## Open design questions

- Language selection: host pick vs group vote?
- How many categories per round — 3 or 5?
- Steal model: strict next-player vs free-for-all fastest-correct?
- Per-match scoring only, or cumulative across matches for the same group?
- Should we show the running scoreboard on the TV during a question (subtle side panel), or only between rounds?
- How much character does the game have — silent neutral aesthetic, or a "host" persona that reacts (sound bites, micro-animations) to right/wrong answers?
