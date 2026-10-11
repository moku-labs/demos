# ticktoe

**Tic-tac-toe against a bot, in a candy toy box.**

One player, one bot, three levels. A portrait 2D game for the phone on `@moku-labs/game`: a splash,
Home, the Board and a result card. It is a game folder, not a framework and not a library: there is
no `src/`, no `createApp` call and no server.

<br/>

[![engine](https://img.shields.io/badge/%40moku--labs%2Fgame-0.14.2-1864ab)](#requirements)
[![pixi](https://img.shields.io/badge/pixi.js-8.22.0-e72264)](#requirements)
[![types](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](#requirements)
[![node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](#requirements)
[![bun](https://img.shields.io/badge/bun-%3E%3D1.4.2-2da44e?logo=bun&logoColor=white)](#requirements)

<br/>

[What it is](#what-it-is) · [Quick start](#quick-start) · [How to play](#how-to-play) · [Bot levels](#bot-levels) · [Sound](#sound) · [Layout](#layout) · [Scripts](#scripts) · [Testing](#testing) · [CI](#ci) · [Requirements](#requirements)

---

## What it is

- **A whole small game.** The splash shows real loading progress, Home picks the level, the Board
  plays the round, the card shows the result.
- **A deterministic graph.** The game is a flow of nodes. State commits on edges only. The same
  seed and the same taps give the same round.
- **Pure rules.** The bot and the win check are plain functions with no engine import, no clock
  and no random call.
- **Not a multiplayer game.** The second player is always the bot.

## Quick start

> [!NOTE]
> **Status: a demo.** The game is private and has no release and no deploy target. It lives in
> `moku-labs/demos`, where the engine and the editor run its tests on their pull requests.

```bash
bun install
bun run dev
```

`bun run dev` serves the game with hot reload on port 3000 and prints its URL.

```bash
bun run editor
```

`bun run editor` opens the same game with the tools of `@moku-labs/editor`.

> [!TIP]
> In dev, `?player=<name>` starts from a prepared save in `tests/scenarios/`: `fresh` (a new
> player), `scored` (Normal, score 2 / 1 / 1), `hard` (the Hard level).

## How to play

1. Wait for the splash. It leaves when the assets are loaded and 2.4 seconds have passed.
2. Pick a level on Home: Easy, Normal or Hard. Tap Play.
3. You are X. Tap a free tile. The bot is O and answers after a short pause of 0.4 to 0.7 seconds.
4. Three in a row wins. A full board with no line is a draw.
5. The card offers Play again or Home. The first move alternates: you open round 1, the bot round 2.

The level, the score and who opens the next round are saved in the browser. A round in progress is
not saved: after a reload the game starts at Home with an empty board.

## Bot levels

| Level | How it moves |
|---|---|
| Easy | A random free cell. One move in four it plays as Normal. |
| Normal | Takes a win, else blocks yours. Otherwise 40 % of the moves go centre, corner, edge, the rest are random. |
| Hard | Searches the whole game. It never loses: the best you get is a draw. |

The numbers live in `core/tables.ts`. The rules live in `features/match/rules/`.

## Sound

One looping theme and 13 sound effects, all `.mp3`. The audio plugin of the engine plays them:
`game.screen()` composes it, so `index.ts` names nothing for it. In a browser the game is silent
until the first touch, because a browser lets no page sound before one. A shell that lets audio
play at once, a native webview with the gesture requirement off, sounds from the splash on. On an
iPhone the silent switch mutes it.

| Key | File | When it sounds |
|---|---|---|
| `match.theme` | `features/match/assets/theme.mp3` | The music of the scene `stage`: Home and the Board. It loops. |
| `ui.tap` | `shared/assets/tap.mp3` | Play, Home, Play again and Home on the card. |
| `match.level` | `features/match/assets/level.mp3` | A level is picked. |
| `match.whoosh` | `features/match/assets/whoosh.mp3` | The hills slide: Home to the Board and back. |
| `match.place-x` | `features/match/assets/place-x.mp3` | Your X touches its tile. |
| `match.place-o` | `features/match/assets/place-o.mp3` | The bot's O touches its tile. |
| `match.refuse` | `features/match/assets/refuse.mp3` | A tap that cannot be taken: the head shake. |
| `match.win` | `features/match/assets/win.mp3` | You win the round: your last X touches its tile. |
| `match.loss` | `features/match/assets/loss.mp3` | The bot wins the round: its last O touches its tile. |
| `match.draw` | `features/match/assets/draw.mp3` | The round is a draw: the last piece touches its tile. |
| `match.score` | `features/match/assets/score.mp3` | The score digit rolls. |
| `match.card` | `features/match/assets/card.mp3` | The result card starts to rise. |
| `match.flip` | `features/match/assets/flip.mp3` | Play again: the tiles turn clean. |
| `splash.splash` | `features/splash/assets/splash.mp3` | The X and the O meet on the splash. In a browser heard only after a touch. |

The theme is in the bundle `match`, which loads behind the splash, so its 1.4 MB never delay the
first frame.

The files come from ElevenLabs, ordered through `@moku-labs/ai`. The order is `audio.moku.yaml`:
one item per file, with its prompt and its length. Its outputs land in `out/audio/`, which git
ignores. To order one sound again:

1. Change the prompt of its item in `audio.moku.yaml`. An item that did not change is not billed again.
2. Run the order. It reads `ELEVENLABS_API_KEY` from the shell or from `.env.local`.
3. Bring the peak of the new file to about -1 dB and write it into its asset folder. A file from
   the order can be far too quiet: the tap came 24 dB under full scale and was not heard.
4. Run `bun run keys`.

```bash
bunx moku estimate audio.moku.yaml   # the cost, without a key
bunx moku run audio.moku.yaml        # writes out/audio/sfx/tap.mp3

peak=$(ffmpeg -i out/audio/sfx/tap.mp3 -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(.*\) dB/\1/p')
ffmpeg -i out/audio/sfx/tap.mp3 -af "volume=$(echo "-1 - ($peak)" | bc)dB" -b:a 128k shared/assets/tap.mp3
bun run keys
```

## Layout

| Path | Holds |
|---|---|
| `index.ts` | The game as one data object: `defineGameApp`. |
| `game.ts` | The root flow: splash, Home, round. |
| `config.ts` | The page: title, background, orientation, save. |
| `core/` | The plain types, the state of a player and a session, the balance tables, the kit. |
| `shared/` | What two features need: tokens, text styles, panels, the font. |
| `features/splash/` | The splash scene and the nodes that wait for loading and the minimum time. |
| `features/match/` | The rules, the bot, the flows `round` and `roundEnd`, the Board views and motion. |
| `features/stage/` | The scene `stage`: sky, hills, Home, the level picker. |
| `plugins/load-progress/` | Posts loading progress and `ready` into the flow. |
| `generated/` | Asset keys, strings and the dev manifest. Written by `bun run keys`. Never edited. |
| `tests/` | Integration tests, helpers, scenarios, visual tests and their baselines, the editor tests and the hot swap test. |

A layer imports only from the layers below it: core, then shared, then features. A feature reaches
another feature through `@features/<name>` only.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | The game page with hot reload. |
| `bun run editor` | The same game with the editor's tools. |
| `bun run keys` | Writes `generated/`: asset keys, compiled strings, the dev manifest. |
| `bun run pack` | The production asset pack in `dist/assets`. |
| `bun run build` | `keys --check`, then the pack and the production page in `dist/web`. |
| `bun run native` | One verb of `@moku-labs/native`. Needs a `native` section in `config.ts`. |
| `bun run lint` | Biome check and oxlint. |
| `bun run lint:fix` | Fixes what the linters can fix. |
| `bun run format` | Formats with Biome. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run test` | The headless tests: the vitest project `unit`. |
| `bun run test:coverage` | The same tests with coverage. The threshold is 90 %. |
| `bun run test:visual` | The visual tests: state and layout everywhere, pixels on a Mac. |
| `bun run test:editor` | The editor on the game and the hot swap test: the vitest projects `editor` and `hot`. |
| `bun run test:hot` | The hot swap test alone. |

Run `bun run keys` after adding an asset or a message, before the typecheck.

## Testing

| Kind | Where | Runs in | What it checks |
|---|---|---|---|
| Unit | `features/<name>/__tests__/unit/`, `shared/__tests__/unit/` | `test` | Rules, the bot, motion data. |
| Isolated | `features/<name>/__tests__/isolated/` | `test` | One feature's flow alone, on a fake clock. |
| Integration | `tests/integration/`, `features/<name>/__tests__/integration/` | `test` | The whole game, headless and on a screen app in plain Bun. |
| Visual | `tests/visual/*.visual.ts` | `test:visual` | Seven screens: `splash`, `home`, `board`, `win`, `loss`, `draw`, `result`. |
| Editor | `tests/editor/*.editor.ts` | `test:editor` | `@moku-labs/editor` on the game: it attaches, lists the doors, picks an element, takes a screenshot, taps Play. |
| Hot swap | `tests/hot/*.hot.ts` | `test:editor`, `test:hot` | A save of a string, a `.tsx` and a texture reaches the page of `moku-game dev` with no reload. |

The headless tests use a fake clock and a fixed seed, so a round plays the same every time. The
helpers in `tests/helpers/splash.ts` start a game at Home, play a move and play a round.

### Visual tests

`bun run test:visual` plays each screen twice. The headless leg runs in plain Bun and compares the
state and the layout with `state.json` and `describe.json`. The pixel leg runs on a Mac only: it
opens the game in the Chromium of `playwright-core` with WebGPU and compares the picture with
`screen.webp`. The command serves the page itself, on a free port. A missing baseline is written.
The baselines in `tests/visual/baselines/<test>/<checkpoint>/` are committed.

```bash
bunx playwright-core install chromium   # once, for the pixel leg
bun run test:visual                     # both legs on a Mac
bun run test:visual --no-pixels         # the headless leg alone, on any machine
bun run test:visual --update            # accept a change on purpose, on a Mac
```

A picture that differs leaves `screen.actual.webp` and `screen.diff.webp` beside its baseline. Git
ignores both.

A checkpoint holds no moment of a clock. The headless leg runs on a fake clock and the page on the
device clock, and the two legs must reach the same state. So `win`, `loss` and `draw` restore the
finished round at `round/celebrate` instead of playing it. Where a restored session keeps a due
moment, it holds one no clock reaches (`NEVER_DUE` in `tests/helpers/visual.ts`): a timer the page
armed on its own then changes nothing.

### Editor tests

`tests/editor/` starts the three cores of the editor in one process, over a real socket on a free
port: the server on a temp copy of the game, the agent on the whole game at Home, the tools page in
happy-dom. The game runs in plain Bun, so its renderer draws nothing: the screenshot test follows a
fixed picture through the editor, not a real frame.

`tests/hot/` copies the game into the temp folder, starts `moku-game dev` there on a free port and
opens the page in headless Chromium. Neither test uses port 3000, and neither writes into the game.

## CI

The game is a demo of `moku-labs/demos`: its `package.json` says `"moku": { "demo": true }`. The
workflow `demos.yml` of `moku-labs/ci` installs with the lockfile and runs three scripts.

| Job | Runner | Script |
|---|---|---|
| fast | ubuntu | `bun run test` |
| visual | macOS | `bunx playwright-core install chromium`, then `bun run test:visual` |
| editor | ubuntu | `bunx playwright-core install --with-deps chromium`, then `bun run test:editor` |

It may put another engine or editor over the pins of `@moku-labs/game` and `@moku-labs/editor`, so
both stay pinned to an exact version. It refuses a tracked file that holds a machine path. The
folder has no workflow and no git hook of its own: run `bun run lint`, `bun run typecheck`,
`bun run test` and `bun run build` before a commit.

## Requirements

- Node 24 or newer, Bun 1.4.2 or newer. The tests run on Bun itself (`bun --bun vitest`).
- `@moku-labs/game` 0.14.2 on `pixi.js` 8.22.0. Dev tools: `@moku-labs/editor` 0.10.0.
- `playwright-core` 1.60.0 and its Chromium for the pixel leg and the hot swap test.
- TypeScript 6, strict mode.

The engine in one page is `node_modules/@moku-labs/game/llms.txt`. It always matches the installed
version.
