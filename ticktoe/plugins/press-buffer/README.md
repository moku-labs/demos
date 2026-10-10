# pressBuffer

Keeps the last press a closed gate refused, and answers the gate with it when it opens. A transit node closes
the gate while it awaits its animation. A press made then is refused without a trace: the button shows its
pressed look and nothing starts. With this plugin a quick tap on a free tile right after a wrong one is played
when the head shake ends.

Standard tier. No API, no events of its own. Depends on `inputPlugin` (its `onTap`), `worldPlugin` (the
`Tappable` of the tapped view), `timePlugin` (the frame step and its clock) and `flowPlugin` (the gate and
the event `flow:edge`).

## Config

```ts
pluginConfigs: { pressBuffer: { keepMs: tables.press.keepMs } }
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `keepMs` | `number` | `500` | How long a refused press is kept, in milliseconds of `time`. The game's number is `tables.press.keepMs` in `core/tables.ts` |

## What it does

| When | What happens |
|---|---|
| A view with a `Tappable` is tapped and the gate is closed | The press is kept: its intent, its payload and the moment of `time`. It takes the place of the one kept before |
| A view with a `Tappable` is tapped and the gate is open | Nothing is kept, and a press kept before is dropped. The gate takes the new press or refuses it by its own list |
| A frame, the gate is open and lists the intent of the kept press | `flow.gate.answer` is called with the press, once. Nothing is kept after it |
| A frame, the kept press is older than `keepMs` | The press is forgotten |
| The graph takes an edge with the intent and the payload of the kept press | The press is forgotten: the engine delivered it itself |

```ts
// The human taps the taken tile 4, then the free tile 8 while the head shakes.
app.input.tap({ projection: "match.tray", key: "tile4" }); // true: `round/refuseTap` plays the shake
app.input.tap({ projection: "match.tray", key: "tile8" }); // false: the gate is closed, the press is kept
// 300 ms of frames later `round/humanTurn` opens the gate, and the next frame answers it:
// { intent: "tap", payload: { cell: 8 } }. The X is on tile 8.
```

## Rules

- One slot. Only the last refused press is kept.
- A press is delivered only to an open gate that lists its intent. A tap on a tile never becomes Play.
- A press the gate takes is never kept. A press the game refuses by its own rule is not changed: a tap during
  the bot's pause is still taken by the gate and answered with the head shake.
- The age is counted in `time`, the frames of the game. The animations that close the gate count in it too,
  so a press made during an animation of up to `keepMs` always lives to its end. A test moves it with
  `app.time.step`.
- A press is offered once. The slot is emptied before the gate is answered.
- A tap on a view that names no intent is no press. It changes nothing.
- Nothing is kept during a fast walk: there every animation ends at once and the route answers the gate.
- The plugin only calls `flow.gate.answer`. It writes no state, no save and no journal entry of its own, and
  it draws from no random stream.

## Why it hears `flow:edge`

The engine keeps a refused answer itself, for one frame, and offers it again when the gate opens within that
frame. A press made in the frame an animation ends is delivered that way. The plugin would then deliver its
own copy to the next gate that lists the intent: a tap on a tile would place the X and then shake at the bot's
pause. The edge that follows a delivery has the intent as its outcome and carries the payload. When such an
edge comes, the kept press was served.

## Files

| File | Holds |
|---|---|
| `index.ts` | The wiring: `depends`, the config default, the tap listener and the frame step in `onStart`, their removal in `onStop`, the hook |
| `types.ts` | `Config`, `State`, `Press`, `Tapped`, `Graph`, `Edge` |
| `state.ts` | `createPressBufferState()`: no press, no remover |
| `handlers.ts` | `onTap`, `onFrame`, `onEdge`, `onStop`: pure functions over the state and the graph |

## Limits

- The screen app has it, `game.headless()` does not: without a screen there is no press and no animation.
- `app.input.tap` and the tap command of the editor still answer `false` for a press that is kept. The action
  starts up to `keepMs` later.
- Only taps are heard, through `input.onTap`. A long press, a drop, a swipe and a trace are not kept. This
  game has none.
- `flow.gate.answer` called directly is no press: nothing is kept. The Answer command of the editor and a
  test call it so. A closed gate still drops such an answer.
- A press is known as served by the edge it leaves. A node that waits for answers inside its body and returns
  another outcome or another payload, such as a popup, leaves no such edge. A press the engine delivered
  there could reach a later gate a second time. This game has no such node: `home` returns what it was
  answered.
- Two taps on the same view in one tick count as one. The edge of the first carries the same press.
- `time` stands still while the game is paused, and so does the age of a kept press.
