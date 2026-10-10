/**
 * @file The branches of the Board's motion hooks no screen test reaches, called with a stub view
 * that records what the hook asked for: a view that has no rest pose yet, a piece that enters with
 * no drop hint, and the hooks that bring a piece to rest after a result.
 */
import { describe, expect, it } from "vitest";
import { cardEnter, topPieceEnter } from "../../motion/card-motion";
import { homeEnter, hudEnter } from "../../motion/hud-motion";
import {
  RESULT_DELAY_MS,
  resultDelay,
  SETTLE_MS,
  settleColour,
  settlePose,
  settleShape
} from "../../motion/outcome-motion";
import { pieceEnter, X_DROP_MS } from "../../motion/piece-motion";
import { trayEnter } from "../../motion/tile-motion";
import { O_DROP_MS, O_LANDS_MS, X_LANDS_MS } from "../../motion/timing";
import { PIECE } from "../../styles/board";
import type { PieceItem } from "../../views/board-items";
import { ROLE } from "../../world/components/markers";
import { stubView } from "../fixtures/stub-view";

/** The hint of a move, as the node emits it. */
const dropped = { kind: "drop", payload: { piece: "piece4" }, hint: true } as const;

/** The rest pose of a piece in the middle cell. */
const pieceRest = {
  Transform: { x: 426.5, y: 426.5, rotation: 0, scale: 1, pivot: { x: 0, y: -PIECE / 2 } },
  Sprite: { width: PIECE, height: PIECE, alpha: 1 }
};

/** A piece or a shadow of the table. */
function item(fields: Partial<PieceItem> = {}): PieceItem {
  return {
    key: "piece4",
    kind: "piece",
    cell: 4,
    mark: 1,
    role: ROLE.none,
    step: 0,
    endedBy: 0,
    ...fields
  };
}

describe("pieceEnter", () => {
  it("does nothing without the drop hint: the piece simply stands there", () => {
    for (const routed of [undefined, { kind: "other", hint: true } as const]) {
      const { view, calls } = stubView<PieceItem>(pieceRest);

      expect(pieceEnter(view, item(), routed)).toBeUndefined();
      expect(calls).toEqual([]);
    }
  });

  it("does nothing for a view with no rest pose", () => {
    const piece = stubView<PieceItem>();
    const shadow = stubView<PieceItem>();

    expect(pieceEnter(piece.view, item(), dropped)).toBeDefined();
    expect(pieceEnter(shadow.view, item({ kind: "shadow" }), dropped)).toBeUndefined();
    expect(piece.calls).toEqual([{ op: "all", motions: 0 }]);
    expect(shadow.calls).toEqual([]);
  });
});

describe("the result on the pieces", () => {
  it("waits for the last piece: winners until X has settled, the rest until it has landed", () => {
    expect(RESULT_DELAY_MS).toEqual({
      winner: X_DROP_MS,
      dimmed: X_LANDS_MS,
      sagged: O_LANDS_MS,
      shrug: { x: X_DROP_MS, o: O_DROP_MS }
    });
    expect(resultDelay(item())).toBe(0);
    expect(resultDelay(item({ role: ROLE.winner }))).toBe(640);
    expect(resultDelay(item({ role: ROLE.dimmed }))).toBe(269);
    expect(resultDelay(item({ role: ROLE.sagged }))).toBe(317);
    // A shrug waits until the piece that ended the draw has settled, and the O takes longer.
    expect(resultDelay(item({ role: ROLE.shrug, endedBy: 1 }))).toBe(640);
    expect(resultDelay(item({ role: ROLE.shrug, endedBy: 2 }))).toBe(880);
  });

  it("brings the pose, the shape and the colour to rest when the result starts to show", () => {
    const dimmed = stubView<PieceItem>(pieceRest);
    const sagged = stubView<PieceItem>(pieceRest);

    settlePose(dimmed.view, item(), item({ role: ROLE.dimmed }));
    settleColour(dimmed.view, item(), item({ role: ROLE.dimmed }));
    settleShape(sagged.view, item(), item({ role: ROLE.sagged }));
    settleColour(sagged.view, item(), item({ role: ROLE.sagged }));

    expect(dimmed.calls).toEqual([
      {
        op: "toRest",
        component: "Transform",
        options: { ms: SETTLE_MS.dim, ease: "outBack", delayMs: X_LANDS_MS }
      },
      {
        op: "toRest",
        component: "effects.colorMatrix",
        options: { ms: SETTLE_MS.colour, delayMs: X_LANDS_MS }
      }
    ]);
    expect(sagged.calls).toEqual([
      {
        op: "toRest",
        component: "Sprite",
        options: { ms: SETTLE_MS.sag, ease: "out", delayMs: O_LANDS_MS }
      },
      {
        op: "toRest",
        component: "effects.colorMatrix",
        options: { ms: SETTLE_MS.colour, delayMs: O_LANDS_MS }
      }
    ]);
  });
});

describe("the tray", () => {
  it("does nothing without a rest pose", () => {
    const { view, calls } = stubView();

    expect(trayEnter(view)).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("the score row, the pill and the Home button", () => {
  it("do nothing without a rest pose", () => {
    const hud = stubView();
    const home = stubView();

    expect(hudEnter(hud.view)).toBeUndefined();
    expect(homeEnter(home.view)).toBeUndefined();
    expect([...hud.calls, ...home.calls]).toEqual([]);
  });
});

describe("the result card", () => {
  it("does nothing without a rest pose", () => {
    const card = stubView();
    const piece = stubView();

    expect(cardEnter(card.view)).toBeUndefined();
    expect(topPieceEnter(piece.view)).toBeUndefined();
    expect([...card.calls, ...piece.calls]).toEqual([]);
  });
});
