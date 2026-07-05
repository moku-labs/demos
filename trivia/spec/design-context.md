# Trivia — Design Context

> *"Fast, social, looks great on the big screen — easy to tap on a phone."*
> A couch-multiplayer party quiz for 1–5 players across 12 rounds, built on two surfaces: a shared TV
> stage and individual phone controllers. The vibe is Jackbox / Knowledge is Power energy — warm, tactile,
> and gloriously over-the-top. This document is the full design picture: how it feels, how it works, and
> every screen and element in it. It is intentionally non-technical — a brief for whoever reimplements
> Trivia on the real stack.

## 0. ⚠️ How to use this document — spec, not source

**This is a design specification, not a codebase.** It captures *what* Trivia looks like, feels like,
and how it behaves — the visual language, the interaction grammar, and the complete inventory of every
screen and element. It exists to be **re-implemented from scratch** on the real stack.

The prototype files referenced below (the HTML / CSS / JS in this folder) are **throwaway demo code** —
deliberately quick and dirty, buggy, and un-idiomatic. They were built for ONE purpose: to communicate
look, feel, behaviour, and the screen/element inventory. They are **NOT** built to this project's
framework standards, and their bugs are not part of the spec.

Therefore, whoever implements this **MUST NOT**:
- copy or lift source (CSS / JS / HTML) from the prototype,
- port its DOM structure, its class names, or its (buggy) behaviour 1:1,
- treat the prototype as a starting point or scaffold for real code.

They **MUST re-implement from scratch**, honouring **all** the patterns and conventions this project
requires. For a Layer-3 Moku web app that means the **moku-web** island architecture, `@scope` / `@layer`
CSS, `data-*` attributes (never class selectors — Rule R5), the design-token system, the one-route-table
rule (R2), the node-free client bundle (R3), and readable-code style — see the **moku-web** skill
(`references/project-spec.md`, Rules R1–R7) and **moku-readable-code**. **This document tells you WHAT to
build; the framework conventions tell you HOW.**

**Files in this folder**
| File | What it is |
|------|-----------|
| [`index.html`](./index.html) | The complete, runnable prototype. Open it in a browser — everything below is live and clickable. The behavioural source of truth — but **demo-quality**, not code to copy. |
| `design-context.md` | This document. |
| `concept-spec.md` | The frozen feature checklist and demo data that drove the prototype. |
| `screenshots/` | Visual reference screenshots captured from the prototype — builder reference only. |

The prototype is front-end only: all state is held in JS variables, there is no networking, no real QR
scanning, no real audio, no backend, and no persistence. The flag of Bangladesh and all flags are rendered
with inline CSS/SVG. The faux-QR is a hand-coded grid pattern, not a real QR library.

---

## 1. The idea

Trivia is a party quiz designed for the couch: one person opens the game on the TV, everyone else scans
a QR code with their phone, and the group plays together in the same room. The TV is the shared stage
where everyone reads questions and watches the drama unfold. The phones are private controllers where each
player makes their choices. These two surfaces never duplicate information — if it is information for
everyone, it lives on the TV; if it is a choice for one person, it lives on their phone.

The design target is the energy of *Jackbox* or *Knowledge is Power*: short rounds, a steal mechanic
that keeps everyone alert even when it is not their turn, a difficulty ramp that starts gentle and ends
fierce, and a final podium moment that rewards the whole group. The aesthetic is Claymorphic Toy 3D —
soft, puffy, tactile, and warm — designed to feel like a Saturday night in, not a classroom quiz.

## 2. Look & feel

**Personality —** Claymorphic Toy 3D: soft, tactile, friendly. Everything feels slightly inflated and
rounded — like the interface was pressed out of warm clay. Buttons have physical depth; cards catch
imaginary light; motion is springy and forgiving. The TV stage reads like a cinematic game show set in
deep indigo/violet space. The phone feels like a chunky toy remote.

**Typography —** Two voices, one personality. **Fredoka** (Google Fonts, weights 400–700) is the display
voice: game title, large numbers, player names, category names, scoreboard labels, podium text, and all
the punchy UI moments. It is round, bold, and reads at distance. **Quicksand** (Google Fonts, weights
400–700) is the body voice: supporting text, hints, sub-labels, the question prompt itself, and anywhere
more words appear. Both are soft and friendly — no sharp serifs, no cold geometric grotesques.

**Colour —** Two palettes that never collide.

*TV stage:* Deep indigo/violet base (`#1A0E3D` → `#0D0820`) with radial warm highlights that shift
per-screen context: lobby is cold violet, category pick warms to amber (the active player's colour bleeds
into the background gradient), reveal is warm dark amber, scoreboard is neutral indigo, podium is rich
purple. Floating semi-transparent dots (6% white opacity) provide subtle depth on the lobby background.

*Clay accent palette* (used for UI furniture): coral `#FF6B6B`, mint `#4ECDC4`, sky `#74B9FF`, lemon
`#FFE066`, lilac `#C77DFF`, peach `#FFB347`, green `#7BC67E`, cream `#FFF3E0`. The lemon is the hero
highlight — room codes, timer numbers, active stepper dots, round-number callouts.

*Player signature colours* (always tied to their owner, not answer slots):
- Alex: amber `#F59E0B`
- Mia: violet `#8B5CF6`
- Sam: teal `#14B8A6`
- Leo: coral-red `#EF4444`
- Pat: lime `#84CC16`

*Answer slot colours* (fixed, never reassigned to players):
- A: red `#E84040` with ▲ triangle
- B: blue `#2D7DD2` with ◆ diamond
- C: yellow `#F5C518` with ● circle
- D: green `#2ECC71` with ■ square

Player colours and answer slot colours are always distinct and must never clash or be confused.

*Phone backgrounds:* rich saturated gradients that shift to match context — deep violet for join, dark
green for waiting, warm amber for category, dark navy for answering, full-screen bright green for correct
reveal, full-screen bright red for wrong reveal, warm amber for the final result card.

**Surface & rules —** Every interactive surface is a clay card: pure white or lightly tinted background,
large border-radius (12 px → 40 px depending on scale), and a layered shadow system with a dark drop
shadow below plus a white inset highlight on the top edge simulating ambient light catching a rounded
surface. Four shadow tiers: `sm`, `md`, `lg`, `xl`. A `pressed` shadow inverts the system (inset dark,
reduced drop) for tactile feedback. The TV and phone bezels are very dark brown-black (`#1A0E05`), framing
the content like real hardware.

**Motion —** The signature easing is `cubic-bezier(0.34, 1.56, 0.64, 1)` — springy, slightly overshoots,
snaps back. All interactive elements use it. Durations are short and purposeful: hover lifts are 120–200 ms,
entry animations are 400–700 ms, steal handoffs and reveal bursts are 300–600 ms. Every animation carries
meaning — nothing is decorative-only. The complete set of required animations:

- **QR breathing pulse** — the faux-QR block gently scales and glows on a 2.5 s loop while waiting for
  players to join.
- **Player tile pop-in** — each player tile enters with a spring scale-up from 60% with a ♪ sound-cue
  marker appearing; each tile has a staggered delay (0.1 s per player).
- **Round-intro number flip** — the large round number (`7`) enters with a spring-pop scale from 0.7 plus
  a blurred radial color wash behind it; the active player chip slides in 150 ms after.
- **Category card spotlight → chosen banner** — on pick, the chosen card scales to 1.06× and glows in the
  active player's signature colour; all other cards fade to 28% opacity and scale to 0.92×; a pill banner
  drops in from above.
- **Question options stagger-in** — the four answer tiles enter offset by ~80 ms each.
- **Timer ring depletes** — the circular SVG ring drains from full (mint stroke) through amber and into
  coral-red at the last 3 seconds; the coral state pulses gently (opacity oscillates).
- **Phone lock-in flash** — when a player taps their answer, the chosen button squishes with a `pressed`
  state; all other buttons fade to 35%; a lock overlay appears on the tapped button; the countdown
  accelerates to red; after 2 seconds the phone switches to the reveal flash screen.
- **Correct burst/shockwave** — the correct answer tile pops with a spring (scale 0.95 → 1.04 → 1.0) and
  a wide blue glow; the TV banner and reveal chip animate in on the correct player's colour.
- **Steal handoff** — the steal strip slides in from the left; the steal chip animates in; the steal timer
  bar begins draining in the stealing player's colour.
- **Leaderboard tile reorder with spring** — tiles animate position with the spring easing; the ascending
  tile gets a mint glow and "▲ overtook [player]" badge.
- **Podium steps rise in sequence** — silver rises first (0.4 s delay), gold centre (0.1 s), bronze last
  (0.7 s) — each with a `translateY(60px) opacity:0` → natural spring rise.
- **Winner colour wash + confetti** — 28 confetti pieces fall across the TV screen in the clay accent
  colours; the podium gold block glows amber.

Respect `prefers-reduced-motion` — all springy transforms and the QR pulse should collapse to
`transition: opacity 0.15s ease` or similar; confetti should not appear; the podium rise should be
instant.

**Theming —** Single colour scheme (no light/dark toggle). The TV is always dark; the phone always uses
its context-specific dark gradient. There is no user-facing theme toggle.

## 3. How it is organised (information architecture)

```
Match
  └─ Setup
       ├─ Lobby (TV) / Join wizard (Phone)
       └─ Language pick (TV) / Language vote (Phone)
  └─ Round loop (×12)
       ├─ Round intro (TV overlay)
       ├─ Category pick (TV spectator + Phone active or waiting)
       ├─ Question (TV) + Answer grid (Phone)
       ├─ Reveal (TV) + Reveal flash (Phone)
       └─ Interstitial scoreboard (TV) + Between-rounds wait (Phone)
  └─ Final
       └─ Podium (TV) + Final result card (Phone)
```

The active player rotates each round — whoever is active picks the category and answers first. All other
players watch the TV and wait; if the active player fails, the steal chance passes to the next player.
There is no persistent user account; identity (name, avatar, colour) is chosen fresh at each join. Room
codes are ephemeral per match.

## 4. The interaction language (consistent everywhere)

**The golden rule:** TV holds words and shared state; phones hold per-player choices. The phone is almost
entirely coloured buttons — minimal reading, maximum tap surface. The TV is cinematic — large type,
generous white space, readable at 3 metres.

**Answer encoding (colorblind-safe):** Every answer option always presents all three cues simultaneously:
letter (A/B/C/D), shape (▲/◆/●/■), and colour (red/blue/yellow/green). The phone shows only the
colour+shape+letter (no answer text); the TV shows the full text alongside. A player who cannot distinguish
red from green can use the shape or letter. This triple-encoding must be preserved everywhere an answer
option appears.

**Difficulty pips:** Difficulty is shown as a row of three circles, filled vs empty, where filled circles
are lemon-yellow and glowing. Easy = one pip filled; medium = two filled; hard = three filled. Pips appear
in the category tag on the TV question screen and in the category pick chooser bar.

**Sound cue markers (♪):** At moments where audio would play (player join, correct answer, scoreboard
reorder, fanfare), a small ♪ glyph appears as a non-interactive text annotation. On the TV lobby, the
♪ appears as a small badge on each newly joined player tile. On the phone waiting screen, the label ends
with ♪. These markers exist so the builder knows where audio hooks belong, without requiring real audio
in the prototype.

**Mute toggle:** A pill button labelled "🔊 Sound" lives in the top-right of every TV screen. Tapping it
toggles muting (no real audio in the prototype, but the toggle state should be wired in the real
implementation).

**Steal mechanic:** When the active player answers wrong or their timer expires, the TV immediately shows
the steal strip: a teal-coloured bar at the bottom of the reveal layout naming the next player and showing
a shorter countdown bar (8 seconds). The steal player's phone changes to an active answer grid. If they
answer correctly, a "Sam steals it!" chip appears on the TV. If nobody answers after all steal attempts,
the question goes unanswered and the correct answer is still shown.

**Category pick (reveal):** Once a category is chosen (by the active player's phone or by clicking a TV
card in the prototype), the chosen card pops to 1.06× and glows in the active player's colour; all other
cards fade to 28% opacity. A pill banner drops from above displaying the chosen category icon and name.
The "Alex is picking" chooser row hides. After ~1.3 seconds the game advances to the question screen.

**Timer behaviour:** The circular ring timer starts full (mint stroke) and depletes over the available
time. At the last 3 seconds the stroke switches to coral and pulses. The number in the ring shows the
remaining seconds. On the flag question screen the timer is shown at 3 seconds (low / coral / pulsing).
The phone shows a thin linear countdown bar below the answer grid (mint to red as it depletes).

**Lock-in:** Tapping an answer on the phone is final. The selected button gets a squish press animation,
all other buttons fade to 35%, and a "🔒 Locked in!" overlay appears on the selected button. The steal
info banner appears below the grid. The countdown accelerates and turns red. The phone switches to the
reveal flash after 2 seconds.

**Join wizard:** Three sequential steps on the phone (name → avatar → colour), navigable forward and
back, with a progress-dot indicator at the top. After completing step 3, tapping "Join Game" triggers the
"You're in! ♪" confirmation card with the chosen emoji and "Room 4F2K · Waiting for host…". Every colour
swatch is selectable — a colour already picked by another player included (sharing a colour is allowed and
never blocks a join); the default just lands on an unused hue so the lobby stays varied.

**Language vote:** Players vote on their phone; the TV tallies the votes live with player-emoji avatars
under each language card. A countdown ("Confirming in 4s…") drives the final decision. The language with
the most votes wins.

## 5. Layout & page behaviour

**TV (16:9, 880 × 495 px in the prototype):** All TV screens share a common structure: a top bar
(game logo left, round badge centre, mute/controls right) occupying roughly 10% of the height, and a
content body below filling the rest. The content never scrolls. The question layout is the most
constrained: the prompt lives in a centred hero zone that grows to fill all available space above the
answer grid; the 2×2 answer grid is anchored at the bottom of the content area; the circular timer ring
floats in the top-right corner of the question body, absolutely positioned. Overlay and full-stage
overlays (round intro, pause) use position:absolute inset:0 so they cover the entire TV screen including
the top bar.

**Phone (280 × 580 px in the prototype):** A tall, narrow portrait frame with a dark notch cutout at the
top. Each screen fills the full phone surface. The join wizard, waiting card, category list, and final
result card each use `display:flex; flex-direction:column` with generous padding (28 px top, 12 px sides,
12 px bottom). The answer grid fills all remaining vertical space between the label and the countdown bar.
The category list fills available space with equal-height buttons stacked vertically. Modals (leave,
mid-join) use an absolute backdrop with a blurred overlay; the modal card itself is centred.

**Page chrome (prototype navigation only):** The prototype wraps both frames in a page header containing
the concept title, a step navigation bar, and overlay toggle buttons. This chrome is not part of the
real app — it exists only to navigate the prototype.

**No responsive breakpoints to spec:** The design targets two fixed contexts — a TV browser and a mobile
phone browser. The phone screens use `clamp()` for font sizes where needed. TV type is sized with
`clamp(30px, 3.6vw, 46px)` for the question prompt and `clamp(72px, 12vw, 100px)` for the round-intro
number, targeting readability at 3 metres. No further responsive breakpoints are defined in the prototype.

## 6. Screens, panels & popups — the inventory

> The complete, exhaustive list of everything a user can see. Every distinct surface in the prototype
> appears in exactly one table below.

### A. Full screens / pages

#### TV screens (shared stage)

| # | Screen | What it is |
|---|--------|-----------|
| A1 | **TV — Lobby** | Deep indigo radial-gradient background. Top bar: `trivia.` logo (Fredoka, white with lemon dot accent) + mute button. Body splits left/right: left column has the room code badge (`4F2K` in large lemon Fredoka, 38 px, letter-spaced) above the faux-QR block (120×120 px white card, 9×9 CSS grid pattern, breathing pulse animation) above a scan hint line; right column has a "Players joining" heading above a 3-column players grid (5 filled tiles + 1 empty "Waiting…" tile) and a helper line ("5 / 6 players joined · Waiting for host to start…"). Floating semi-transparent white dots at 6% opacity drift slowly as background texture. |
| A2 | **TV — Language pick** | Navy blue radial-gradient. Top bar with "Match setup" round badge. Body: centred title ("Pick a language for this match"), subtitle ("Most votes wins — tap on your phone"), two large language cards side by side (180 px wide, rounded pill, translucent dark border). English card shows a CSS-rendered US flag, "English" label, and three voter-emoji (🦊🦄🐯) indicating votes; Russian card shows a CSS-rendered Russian flag, "Русский" label, "Russian · Кириллица" sub-label in Quicksand, and two voter-emoji (🐙🐸). The currently leading card is highlighted (brighter border, lemon glow). Live tally line below: "English leads 3–2 · Confirming in 4s…". |
| A3 | **TV — Category pick (spectator view)** | Warm dark amber radial gradient (the active player's amber bleeds in). Top bar shows "Round 7 / 12" badge. Body: chooser row ("🦊 Alex is picking a category…" with difficulty pips ●●○) above the category grid. The grid is 3 columns × 2 rows of category cards (each with a large emoji icon and a category name in Fredoka). The six categories: Animals: Weird & Wonderful 🦎, Outer Space 🪐, Movies & TV 🎬, Food & Drink 🍜, Strange but True 🛸, Music & Hits 🎵. Category-chosen state: the chosen card glows with the player's amber colour and scales to 1.06×; all others fade to 28% and scale to 0.92×; a pill banner drops in above the grid with the category icon + name. |
| A4 | **TV — Question (text)** | Deep navy question background. Top bar shows "Round 7 / 12". Question body: meta bar (category tag with icon + difficulty pips + turn chip "🦊 Alex answering" in player's amber); hero zone centred above the answer grid (prompt text in large Fredoka, up to ~3.6vw, centred, white, readable at distance); 2×2 answer grid anchored at bottom; circular timer ring floated top-right. Demo Q1: "Which animal can survive being frozen solid and then thaw back to life?" with options A▲ Arctic fox (red), B◆ Wood frog (blue), C● Snow hare (yellow), D■ Reindeer (green). Timer shows 14 seconds remaining (mint stroke, ~70% full). |
| A5 | **TV — Question (image/flag)** | Identical layout to A4 but the hero zone contains a large Bangladesh flag (CSS: green background `#006A4E`, off-centre red disc `#F42A41`, 180×108 px, rounded corners) above the prompt "Which country does this flag belong to?". Answer options: A▲ Japan (red), B◆ Bangladesh (blue), C● Palau (yellow), D■ South Korea (green). Timer shows 3 seconds remaining (coral stroke, pulsing — the low-time state). |
| A6 | **TV — Reveal** | Warm dark amber radial gradient. Reuses the exact same layout as A4 (top bar, meta bar, hero zone, 2×2 grid) with the question prompt still visible. The meta bar turn-chip resolves to the outcome. The answer grid tiles resolve: the correct tile (B◆ Wood frog, blue) glows with a white outline, a wide blue box-shadow, and a "✓ CORRECT" pill label in the top-right corner; all other tiles dim to 30% opacity with desaturation. Four distinct outcome states (switchable in the prototype): (1) **Correct**: turn chip "🦊 Alex — Correct! +200" in green; answer-line "✅ Wood frog — Alex nailed it!"; no steal strip. (2) **Wrong → steal**: turn chip "❌ Alex — Wrong (Arctic fox)" in red; the wrong-pick tile (A▲) additionally gets a "✗ Alex" label and remains visible; steal strip slides in below the grid naming Sam, showing 8 s steal countdown bar. (3) **Timeout → steal**: chip "⏱ Time's up — no answer"; steal strip "⏱ Timer ran out — passing to 🐙 Sam to steal". (4) **Sam steals**: chip "🐙 Sam steals it! +100" in green; answer-line "✅ Wood frog — Sam stole the points!"; no steal strip. Score roll-up chips appear below the grid showing each player's name, running score, and delta in their colour. |
| A7 | **TV — Interstitial scoreboard** | Neutral deep-indigo gradient. Top bar shows "After Round 7". Body: title "Standings after Round 7", then 5 full-width score tiles stacked vertically. Each tile: rank number, avatar emoji, player name (in their signature colour), a proportional colour-filled bar (width relative to max score), and the score. The tile for Mia (who just overtook Sam) glows violet and shows "▲ overtook Sam ♪". Scores: 1 Alex 4,200; 2 Mia 3,800 (glow); 3 Sam 3,600; 4 Leo 2,400; 5 Pat 2,000. |
| A8 | **TV — Final podium** | Rich dark purple gradient. Confetti falls (28 multi-coloured pieces in the clay accent palette). Top bar shows "🏆 Final Results". Body: "🎉 Game Over! ♪" title. Podium stage: three podium slots arranged gold-centre, silver-left, bronze-right, each with avatar emoji above name above score above the stepped podium block (gold 90 px, silver 70 px, bronze 55 px; each a gradient from metallic top to darker base). Slots rise in sequence on entry (silver → gold → bronze with delays). Below the podium: two "also-ran" pill tiles (Leo 3,800, Pat 3,400). Stat call-out: "Most steals — Sam 🐙 · Highest streak — 4 (Alex 🦊)". "↩ Play Again" coral pill button centred below. |

#### Phone screens (per-player controller)

| # | Screen | What it is |
|---|--------|-----------|
| A9 | **Phone — Join wizard** | Deep violet gradient background. A 3-step wizard with a dot-progress indicator at the top (3 dots; active dot is lemon-yellow and pill-shaped, inactive dots are dim). **Step 1 (Name):** title "Enter your name", a large centred text input (translucent dark border, Fredoka 18 px, inset shadow). **Step 2 (Avatar):** title "Pick your avatar", a 4×2 grid of emoji avatar options (🦊🦄🐙🐯🐸🦁🐬🦋); selected option highlighted with lemon border and glow. **Step 3 (Color):** title "Pick your color", a row of colour swatches (36 × 36 px circles); every swatch is selectable — colours other players already picked included (sharing a colour is allowed, dupes never block a join), and the default lands on an unused hue so the lobby stays varied; selected colour glows with a colour-matched shadow. Each step has a "Next ▸" lemon button and a "← Back" ghost link (except step 1). After step 3, tapping "Join Game ▸" triggers the **"You're in!"** card: the wizard dots hide; a centred card shows the chosen emoji (52 px), "You're in! ♪" in the player's colour, and "Room 4F2K · Waiting for host…" in muted text. |
| A10 | **Phone — Waiting room** | Dark green gradient. A centred waiting preview card (rounded pill card, amber-tinted border, slowly bobbing `translateY` animation) showing the player's large emoji, their name in amber, and "Room 4F2K · Player 1". Below: "Waiting for host to start… ♪" blinking label. The host sees an additional "▶ Start Game" button in amber (the label changes to "Round 7 done — next round soon ♪" between rounds, and the Start button is hidden). |
| A11 | **Phone — Category pick (active player)** | Warm dark amber gradient. Header: "Your turn to pick, 🦊 Alex!". Below: a full-height vertical stack of 6 large tappable category buttons (rounded, translucent dark fill, icon + name). Tapping highlights the selected button in amber and fades others; after 1.3 s the TV updates and the game advances. |
| A12 | **Phone — Answer grid** | Dark navy gradient. Small header label "Tap your answer". A 2×2 grid of large coloured+shaped answer buttons fills the available space (minimum 100 px height each). Each button: large shape symbol (▲/◆/●/■) + letter (A/B/C/D), no answer text. Post-lock-in state: the tapped button shows a "🔒 Locked in!" dark overlay; all others fade to 35%. Steal-info banner appears below the grid: "🦊 Alex is answering — if they miss, it's your steal!". A thin countdown bar below the grid drains (mint → red). |
| A13 | **Phone — Reveal flash (correct)** | Full-screen bright green gradient (`#0D2B0D` → `#1A4A1A`). Centred: large ✅ icon (56 px), "Correct!" in white Fredoka (26 px), "+200 ♪" in green accent, small "· haptic pulse ·" note in muted text. The entire screen pops in with a spring scale animation. |
| A14 | **Phone — Reveal flash (wrong)** | Full-screen bright red gradient (`#2B0D0D` → `#4A1A1A`). The content would show a wrong-state flash with a shake animation (translateX left-right-left-right). (The prototype shows the correct green variant; the wrong red variant is the `ph-bg-reveal-wrong` background class.) |
| A15 | **Phone — Final result card** | Warm amber gradient. A large centred card with the player's finishing emoji (🥈 for 2nd), "You came 2nd! 🦄" in white Fredoka (22 px), their final score "5,900 pts" in their signature colour (Mia's violet, 32 px), and "Top category: Animals · Best streak: 3" in muted Quicksand. Below the card: two buttons side-by-side — "↩ Play Again" in the player's colour and "Leave" in ghost style. Tapping Leave triggers the leave-game modal. |

### B. Persistent regions (chrome that is always present)

| # | Region | What it is |
|---|--------|-----------|
| B1 | **TV top bar** | Present on every TV screen. Three zones: left = `trivia.` logo in Fredoka 22 px with a lemon dot accent; centre = context badge (round number pill, "Match setup" pill, "🏆 Final Results", or similar — changes per screen); right = mute button ("🔊 Sound") and any additional controls. Semi-transparent dark background, subtle border separator below. |
| B2 | **Phone notch** | An absolute black notch cutout at the top-centre of the phone frame (90×22 px, rounded bottom corners) representing the front camera. Present on all phone screens. |

### C. Overlays — panels & drawers (full-stage, non-modal)

| # | Overlay | What it is |
|---|---------|-----------|
| C1 | **TV — Round intro takeover** | A full-stage absolute overlay (position:absolute, inset:0, z-index:30) with a blurred radial amber colour wash. Centred content: "ROUND" label in spaced caps, the large round number ("7") in lemon Fredoka at 72–100 px with an amber glow, "of 12" in muted text, then a pill chip naming the active player (avatar emoji + name + "Pick a category to begin"). Everything pops in with spring animation; the player chip is delayed 150 ms. Shown before each round's category pick phase. |
| C2 | **TV — Pause takeover** | A full-stage absolute overlay (z-index:30) with a near-opaque dark backdrop and blur. Centred: large ⏸ icon (64 px, sky-blue glow), "Paused" in Fredoka 48 px, a message "Waiting for Alex — tap the host's phone to resume.", and three pulsing dots as an activity indicator. |

### D. Menus & small popups (anchored, transient)

| # | Popup | What it is |
|---|-------|-----------|
| D1 | **TV — Disconnect banner** | Anchored to the top-centre of the TV screen (position:absolute, inset:0, align-items:flex-start, z-index:20, padding-top:12 px). A translucent dark pill card with a blurred backdrop. Shows the disconnected player's emoji, their name in their signature colour, "dropped — reconnecting", a countdown timer line ("0:28 ♪"), and a "Dismiss" ghost button. Border is the disconnected player's colour (teal for Sam). Drops in from above with spring animation. |
| D2 | **TV — Category-exhausted toast** | Same overlay positioning as D1 (top-centre, drops in). A dark pill card with a lilac border and glow. Shows a 🧩 icon, "No fresh questions in Animals — pick another category.", and a "Dismiss" button. Max-width 500 px. |
| D3 | **TV — Reconnect strip** | A full-width bar anchored to the very top of the TV screen (position:absolute, top:0, left:0, right:0, z-index:25). Dark background with a mint bottom border. Shows a 📡 icon, "Reconnecting…" in mint Fredoka, and a spinning circular progress indicator (mint). No dismiss button — it auto-hides when reconnected. |
| D4 | **TV — End-of-match countdown chip** | Anchored to the bottom-centre of the TV screen (position:absolute, bottom:16 px, centred, z-index:25). A translucent pill chip with a blurred backdrop. Shows ⏱ icon, "Returning to lobby in [5]…" with the number in lemon. Appears on the podium screen after the game ends. |

### E. Modals & prompts (centered, dimmed backdrop)

| # | Modal | What it is |
|---|-------|-----------|
| E1 | **Phone — Leave game modal** | A full-phone blurred dark backdrop (rgba 0,0,0,0.6 + 4 px blur, border-radius matches phone corners). A centred clay card (dark warm background `#2A1A08`, rounded-xl, xl shadow, white inset highlight). Shows 🚪 icon (32 px), "Leave the game?" title, "You'll lose your score and won't be able to rejoin." subtitle, and two buttons: "Stay" (ghost) + "Leave" (coral fill). Pops in with spring scale animation. Tapping the backdrop dismisses it. |
| E2 | **Phone — Mid-join modal** | Same backdrop pattern as E1. A centred card showing a 🕹 icon (36 px), "Game in progress" title, "You'll join from the next match when the current game ends." body, and a single "Got it" sky-blue button. Shown to a player who tries to join a room while a match is already in progress. |

### F. Inline & transient elements

| # | Element | What it is |
|---|---------|-----------|
| F1 | **Steal strip (TV Reveal)** | A full-width teal-bordered strip that slides in from the left at the bottom of the reveal layout when a steal is triggered. Shows "→ Alex missed — passing to 🐙 Sam to steal", a "🐙 Sam · 8s" steal chip (teal pill), and a thin steal-timer bar (teal fill, depleting). Hidden when no steal is active. |
| F2 | **Score roll-up chips (TV Reveal)** | Small horizontal row of pill chips below the reveal grid, each showing a player's avatar/name, their current running total, and their delta in their signature colour (e.g. "+200" in Alex's amber). |
| F3 | **Category banner (TV Category pick)** | A pill banner that drops in above the category grid on pick. Shows the category icon emoji and the full category name. Amber border and background when Alex picks; adapts to the active player's colour. Hidden before a category is chosen. |
| F4 | **"Moved up" badge (TV Scoreboard)** | A small "▲ overtook [player] ♪" label in mint Fredoka that appears alongside the tile of a player who just moved up in rank. Only shown during the current-round reorder moment. |
| F5 | **Sound cue markers (♪)** | Non-interactive small text glyphs in lemon (TV lobby player tiles, top-right corner of each filled tile) and in body text (waiting label, score points, Game Over title, reconnect countdown). Mark where audio hooks belong. |
| F6 | **Empty player slot (TV Lobby)** | The sixth player-tile in the lobby grid, shown with a dashed border, 40% opacity, a faded ❓ emoji, and a blinking "Waiting…" text (1.5 s blink cycle). |
| F7 | **Steal info banner (Phone — Answer grid)** | A small rounded dark card below the answer grid that appears after the active player locks in: "🦊 Alex is answering — if they miss, it's your steal!". Hidden by default on non-active-player phones; toggled on after lock-in. |
| F8 | **Phone countdown bar** | A 5 px tall full-width bar below the answer grid on the phone. Mint fill depleting to the right; switches to red in the final seconds. Drains over the question time limit and accelerates to 0% after the player locks in. |
| F9 | **Confetti (TV Podium)** | 28 confetti pieces (6–12 px squares or circles) in the clay accent colours, absolutely positioned, falling on looping CSS keyframe animations with randomised left positions, durations (2–4 s), delays, and sizes. Present only on the podium screen. |
| F10 | **Floating background dots (TV Lobby)** | Three large semi-transparent white circles (120 px, 80 px, 60 px) at 6% opacity, slowly drifting on a 6 s ease-in-out loop. Decorative depth layer behind the lobby content. |
| F11 | **Join step progress dots (Phone — Join wizard)** | A row of three indicator dots at the top of the join wizard. The active step's dot is lemon-yellow and elongated to a 20×8 px pill; inactive dots are dim circles (8×8 px). Hides after the wizard completes. |
| F12 | **Lock-in overlay (Phone — Answer grid)** | An absolute dark overlay (rgba 0,0,0,0.55) that appears on the tapped answer button after lock-in, centred with a 🔒 icon and "Locked in!" in muted Fredoka. |
| F13 | **Voter emoji row (TV Language pick)** | A small horizontal row of player emoji avatars under each language card, showing which players have voted for that option. Updates live as votes come in. |
| F14 | **Reveal answer-line (TV Reveal)** | A sub-line in the hero zone below the question prompt on the reveal screen. Describes the outcome: "✅ Wood frog — Alex nailed it!" (correct), "✅ The answer was Wood frog" (wrong/timeout), "✅ Wood frog — Sam stole the points!" (stolen). Uses mint colour for the correct answer name. |

### G. Recurring components (the building blocks)

**Player tile** — Used in the TV lobby grid. Rounded-md card (translucent dark fill, light border, inset highlight shadow). Contains: large player emoji (48–72 px), player name in Fredoka 20 px white, signature colour dot (14 px circle with a colour-matched glow). A ♪ sound-cue badge appears top-right on filled tiles. Animated in with spring scale-from-60% on load, staggered by join order. Empty variant: dashed border, faded ❓, blinking "Waiting…" text.

**Answer tile (TV)** — A coloured clay button in the 2×2 answer grid. Fixed colour per slot (A=red, B=blue, C=yellow, D=green). Inner gradient highlight simulates the clay surface. Contains: letter (A/B/C/D in Fredoka bold), shape symbol (▲/◆/●/■), and answer text (Quicksand). Hover lifts slightly; active squishes. Reveal states: correct (white outline, wide coloured glow, "✓ CORRECT" pill), dim/wrong (30% opacity, desaturated), wrong-pick (marked with "✗ [Name]" pill).

**Answer tile (Phone)** — Large coloured clay button in the 2×2 phone grid. Identical slot-to-colour assignment as the TV tiles. Contains only the large shape symbol and letter — no text. The buttons are oversized (min-height 100 px) for fat-finger tapping. Post-lock: pressed squish, lock overlay, neighbours fade to 35%.

**Category card (TV)** — A translucent dark rounded-lg card in the 3×2 category grid. Large emoji icon (48 px) above category name in Fredoka 16 px. Hover: slight scale lift and border brighten. Chosen state: amber glow, scale 1.06×. Unchosen-after-pick: 28% opacity, scale 0.92×.

**Category button (Phone)** — A full-width horizontal button in the phone category list. Translucent dark fill, light border. Icon emoji on the left, category name in Fredoka 14 px on the right. Tap highlights in amber and fades others.

**Timer ring** — An 80×80 px SVG circle (radius 35) with a track (10% white stroke) and a depleting progress arc (mint → coral). The progress arc uses `stroke-dasharray: 220` and advances `stroke-dashoffset` to show remaining time. A large number (Fredoka 28 px white) sits centred over the ring. Low-time state: coral stroke, gentle opacity pulse. Floated top-right, absolutely positioned within the question body.

**Turn / result chip** — A small pill in the meta bar on question and reveal screens. On the question screen: the active player's emoji + name + "answering" in their colour. On the reveal screen: the outcome text in a green (correct) or red (wrong) variant. Pill border and background match the player's colour.

**Score chip** — Small translucent pill showing a player's name, running score, and delta (+points). Used in the score roll-up row on the reveal screen.

**Scoreboard tile** — A full-width horizontal row used in the interstitial scoreboard. Contains: rank number (large, muted), avatar emoji, player name (in their colour), a proportional colour-filled bar (player's colour fill), and the score. Can receive a glow border and a "moved up" badge.

**Podium block** — A rounded-top rectangle (100 px wide) in gold/silver/bronze metallic gradients. Height varies: gold 90 px, silver 70 px, bronze 55 px. Displays the medal emoji centred inside. Player info sits above it (avatar emoji, name in player's colour, score in muted text). Animates in from below on entry.

**Clay button** — The base interactive button shape. Large rounded-pill or rounded-xl, filled with a solid colour or gradient, inset white highlight on the top edge, a colour-matched drop shadow below. Hover: small lift + expanded shadow. Active: pressed inset shadow. Used for: "Next ▸" / "Join Game ▸" (lemon), "▶ Start Game" (amber), "↩ Play Again" (coral), "Leave" (ghost), category confirm actions.

**QR block** — A 120×120 px white clay card (rounded, lg shadow) containing a 9×9 CSS grid pattern simulating a QR code. Continuously breathes (scale 1→1.02, shadow pulses to a yellow glow and back) on a 2.5 s loop. Below it: a small scan hint label "Scan or enter code at trivia.play".

**Room code badge** — A translucent dark rounded-lg card containing a small "ROOM CODE" label in spaced caps and the 4-character code (`4F2K`) in large lemon Fredoka (38 px, letter-spacing 6 px, text-shadow glow).

**Language card** — A 180 px wide translucent dark rounded-xl card used in the language pick screen. Contains: a CSS-rendered flag (60×38 px), language name in Fredoka, optional Cyrillic sub-label, and a voter-emoji row. Selected state: lemon border, scale 1.05×, lemon glow shadow.

**Mute button** — A small translucent pill button ("🔊 Sound") in the TV top bar. Hover brightens the background. No other actions in the prototype; in the real app it toggles audio.

**Dismiss button** — A small translucent ghost pill used in the disconnect banner and category-exhausted toast. Hover brightens. Tapping closes the overlay.

## 7. The question screen in detail

The question screen (A4 / A5) is the richest and most time-sensitive screen in the game. Here is a precise breakdown.

**Layout zones (top to bottom):**

1. **TV top bar** (shared chrome) — logo left, "Round 7 / 12" badge centre, mute right. ~10% of screen height.

2. **Question meta bar** — a horizontal strip just below the top bar. Left: the category tag pill containing the category emoji icon, category name, and the difficulty pips (three small circles, lemon if active). Right: the turn chip pill ("🦊 Alex answering") in the active player's colour with a translucent colour-tinted background and a coloured border. No flex-grow — both elements are fixed-width pills. Approximately 5% of screen height.

3. **Question hero zone** — grows to fill all remaining space between the meta bar and the answer grid. Contains the question prompt text centred horizontally and vertically within this zone. The prompt is large Fredoka (clamp 30–46 px), white, line-height 1.18, text-shadow for depth. On the image variant, the Bangladesh flag (180×108 px, `#006A4E` background with an off-centre `#F42A41` disc) appears centred in the hero zone above the one-line prompt. The hero zone is the most important part: it must be generous — the question needs breathing room, not crowded against the answers.

4. **Answer grid** — a 2×2 grid anchored at the bottom of the question body. Each of the four tiles is a clay button: coloured fill, inner gradient highlight, colour-matched shadow. The tile shows letter + shape + text side-by-side. On the reveal screen this grid resolves in-place: the correct tile glows; wrong tiles dim; no layout shift occurs. This is key — the reveal must feel like the same screen resolving, not a different screen.

5. **Circular timer** — floated in the top-right corner of the question body, absolutely positioned so it does not displace the hero zone. 80×80 px SVG ring with the remaining-seconds number centred. The timer is positioned at `top: 2px; right: 6px` relative to the `q-main` container, with `z-index: 3` so it stays above the hero zone content.

**Phone simultaneous state (A12):** While the TV shows the question, the phone shows the 2×2 answer grid (colour+shape+letter only, no text). The phone timer bar runs at the same pace. The player must tap before time runs out or before the active player's timer expires.

**Reveal in-place (A6):** The reveal uses the identical layout as the question — same meta bar, same hero zone with the prompt still visible, same answer grid in the same positions. Only the states change: the turn chip resolves to an outcome chip; a reveal answer-line appears in the hero zone below the prompt; the answer tiles change state (correct/dim/wrong-pick). The steal strip appears below the grid if applicable. This "same layout resolves" approach is intentional — it makes the reveal feel satisfying and grounded.

## 8. Demo content (so screens feel real)

**Room:** code `4F2K`. QR = a hand-coded 9×9 CSS grid pattern (no real QR library required). Join URL hint: "trivia.play".

**Players (signature colour + emoji avatar):**
| Name | Avatar | Signature colour | Hex | Final score |
|------|--------|-----------------|-----|-------------|
| Alex | 🦊 fox | Amber | `#F59E0B` | 6,400 🥇 |
| Mia | 🦄 unicorn | Violet | `#8B5CF6` | 5,900 🥈 |
| Sam | 🐙 octopus | Teal | `#14B8A6` | 5,200 🥉 |
| Leo | 🐯 tiger | Coral-red | `#EF4444` | 3,800 |
| Pat | 🐸 frog | Lime | `#84CC16` | 3,400 |
| _(slot 6)_ | ❓ | — | — | empty "Waiting…" |

**Current round state:** Round 7 / 12. Difficulty: medium (●●○). Active player: Alex 🦊.

**Answer slot colours (fixed, never tied to players):**
| Slot | Letter | Shape | Colour | Hex |
|------|--------|-------|--------|-----|
| A | A | ▲ | Red | `#E84040` |
| B | B | ◆ | Blue | `#2D7DD2` |
| C | C | ● | Yellow | `#F5C518` |
| D | D | ■ | Green | `#2ECC71` |

**Category list (6 categories shown):** Animals: Weird & Wonderful 🦎 · Outer Space 🪐 · Movies & TV 🎬 · Food & Drink 🍜 · Strange but True 🛸 · Music & Hits 🎵. Alex picks: Animals: Weird & Wonderful.

**Q1 — hero, EN, text (Animals, medium ●●○):**
Prompt: "Which animal can survive being frozen solid and then thaw back to life?"
- A ▲ Red — Arctic fox
- B ◆ Blue — Wood frog ✓ (correct)
- C ● Yellow — Snow hare
- D ■ Green — Reindeer

**Q2 — image, EN, flags (medium):**
Flag: Bangladesh — green field `#006A4E` with an off-centre red disc `#F42A41` (disc centred slightly left of mid, approximately 43% from the left).
Prompt: "Which country does this flag belong to?"
- A ▲ Red — Japan
- B ◆ Blue — Bangladesh ✓
- C ● Yellow — Palau
- D ■ Green — South Korea

**Q3 — Russian, text (Science / Наука · Химия, easy ●○○):**
Prompt: "Химическая формула воды?"
- A ▲ Red — CO₂
- B ◆ Blue — H₂O ✓
- C ● Yellow — O₂
- D ■ Green — NaCl

**Reveal states (Q1):**
- Correct: "✅ Wood frog — Alex nailed it!" · chip "🦊 Alex — Correct! +200" (green chip)
- Wrong → steal: Alex picks A (Arctic fox, wrong) · chip "❌ Alex — Wrong (Arctic fox)" (red chip) · steal strip slides in: "→ Alex missed — passing to 🐙 Sam to steal" · steal chip "🐙 Sam · 8s" · steal-timer bar in teal
- Timeout → steal: chip "⏱ Time's up — no answer" · steal strip "⏱ Timer ran out — passing to 🐙 Sam to steal"
- Sam steals: chip "🐙 Sam steals it! +100" (green chip) · answer-line "✅ Wood frog — Sam stole the points!"

**Interstitial scoreboard after Round 7:**
1. Alex 🦊 — 4,200 (leading bar at 100%)
2. Mia 🦄 — 3,800 (bar ~90%, **glowing violet**, "▲ overtook Sam ♪")
3. Sam 🐙 — 3,600 (bar ~86%)
4. Leo 🐯 — 2,400 (bar ~57%)
5. Pat 🐸 — 2,000 (bar ~48%)

**Final podium:**
- 🥇 Gold (centre, 90 px): Alex 🦊 — 6,400
- 🥈 Silver (left, 70 px): Mia 🦄 — 5,900
- 🥉 Bronze (right, 55 px): Sam 🐙 — 5,200
- Also-rans: Leo 🐯 3,800 · Pat 🐸 3,400
- Stat: "Most steals — Sam 🐙 · Highest streak — 4 (Alex 🦊)"

**Phone final card (Mia's phone — 2nd place):**
"🥈 You came 2nd! 🦄" · 5,900 pts (in violet) · "Top category: Animals · Best streak: 3"

**Language vote state:**
English: 3 votes (🦊🦄🐯) · Russian: 2 votes (🐙🐸) · Tally: "English leads 3–2 · Confirming in 4s…"

## 9. Notes for reimplementation (high level)

- **What's faithful:** Every screen layout, state, colour, typography choice, animation beat, and the two-surface split (TV/phone) are final and should be treated as the visual and behavioural specification. The steal mechanic interaction, the answer encoding (always colour+shape+letter together), the player-signature-colour system, the reveal-in-place approach (same layout as the question, resolving in-place), and the motion vocabulary are all non-negotiable aspects of the design.

- **What's stubbed:** All networking, WebRTC, QR scanning, room-code generation, and audio are absent from the prototype. State is held in plain JS variables, not persisted. The faux-QR is a fixed CSS grid pattern — the real implementation will use an actual QR library. The Russian-question toggle is a prototype convenience; in the real app, the language is set once per match and questions are fetched accordingly. The "Confirming in 4s…" language vote countdown is not wired to a real timer. The steal timer bar is visual only. The confetti is always active on the podium screen; in the real app it should fire once on entry.

- **The non-negotiables:** The things that make this design what it is —
  1. **Two distinct surfaces, one language.** TV = words + shared state; phone = coloured buttons + per-player choices. Never blend them.
  2. **Triple answer encoding everywhere.** Every option always shows colour + shape + letter simultaneously. Never just colour alone.
  3. **Player signature colours are sacred.** Alex is always amber, Mia violet, Sam teal, Leo coral-red, Pat lime. These follow the player onto every screen, every chip, every scoreboard bar.
  4. **Reveal in-place.** The reveal must reuse the exact question layout with the same four tiles resolving. It must not feel like a separate screen.
  5. **Springy motion.** The `cubic-bezier(0.34, 1.56, 0.64, 1)` easing and short durations are the heartbeat of the design. Flat or linear motion breaks the claymorphic personality.
  6. **Fredoka + Quicksand.** These two fonts are the design. Substituting them breaks the aesthetic.

- **Re-implement, don't port:** build this on the project's real stack and conventions (moku-web islands, `@scope`/`@layer`, `data-*` only, tokens, one route table, node-free bundle). The prototype is the **what**, not the **how** — see §0.

- **Game rules reference:**
  - 1–5 players sharing one TV screen; 12 rounds per match.
  - At match start, the group votes for a language (English default; Russian always available).
  - Each round, the active player picks a category from the available list, then answers a 4-option question.
  - If the active player answers wrong or their timer expires, the steal passes to the next player (shorter steal timer).
  - If nobody answers, the question goes unanswered; the correct answer is still shown.
  - Correct answers earn points; steal-correct answers earn a portion of the points.
  - Difficulty ramps from easy (round 1–4) through medium (rounds 5–8) to hard (rounds 9–12).
  - A group never sees the same question twice — per-player question history prevents repeats.
  - Questions are generated by the `/trivia-gen` Claude skill (EN + RU, text + image, quality-reviewed, difficulty-graded, answers obfuscated in storage).

---

*Trivia — captured by `/moku:design`. Open `index.html` to explore the prototype; build it for real on the Moku stack.*
