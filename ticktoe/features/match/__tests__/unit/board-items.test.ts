/**
 * @file What the four projections of the Board read from the session: the pieces and their parts in
 * a result, the tiles of the tray, the score row with the pill, and the result card.
 */
import type { Session } from "@core/state";
import { startingSession } from "@core/state";
import { describe, expect, it } from "vitest";
import { cardOf, hudOf, partOf, piecesOf, trayOf } from "../../views/board-items";
import { MOOD, ROLE } from "../../world/components/markers";

/** A session on the Board with some fields changed. */
function on(fields: Partial<Session> = {}): Session {
  return { ...startingSession, screen: "board", ...fields };
}

/** A won round: X took the top row. */
const won = on({ board: [1, 1, 1, 2, 2, 0, 0, 0, 0], turn: 2, result: "win", winLine: [0, 1, 2] });

/** A lost round: O took the middle row. */
const lost = on({
  board: [1, 1, 0, 2, 2, 2, 1, 0, 0],
  turn: 1,
  result: "loss",
  winLine: [3, 4, 5]
});

/** A drawn round. */
const drawn = on({ board: [1, 2, 1, 1, 2, 2, 2, 1, 1], turn: 2, result: "draw" });

describe("piecesOf", () => {
  it("is empty while another screen shows, whatever the board holds", () => {
    expect(piecesOf({ ...won, screen: "home" })).toEqual([]);
  });

  it("is empty on an empty board", () => {
    expect(piecesOf(on())).toEqual([]);
  });

  it("lists the shadow, then the piece, of every taken cell, in cell order", () => {
    const items = piecesOf(on({ board: [1, 0, 0, 0, 2, 0, 0, 0, 0] }));

    expect(items).toEqual(
      [
        { key: "piece0Shadow", kind: "shadow", cell: 0, mark: 1, role: ROLE.none, step: 0 },
        { key: "piece0", kind: "piece", cell: 0, mark: 1, role: ROLE.none, step: 0 },
        { key: "piece4Shadow", kind: "shadow", cell: 4, mark: 2, role: ROLE.none, step: 0 },
        { key: "piece4", kind: "piece", cell: 4, mark: 2, role: ROLE.none, step: 0 }
      ].map(item => ({ ...item, endedBy: 0 }))
    );
  });

  it("gives the winners their place in the line and dims the others", () => {
    const parts = piecesOf(won)
      .filter(item => item.kind === "piece")
      .map(item => [item.cell, item.role, item.step]);

    expect(parts).toEqual([
      [0, ROLE.winner, 0],
      [1, ROLE.winner, 1],
      [2, ROLE.winner, 2],
      [3, ROLE.dimmed, 0],
      [4, ROLE.dimmed, 0]
    ]);
  });

  it("gives a winner the place its cell has in the line, also on a diagonal", () => {
    const diagonal = on({
      board: [2, 0, 1, 2, 1, 0, 1, 0, 0],
      result: "win",
      winLine: [2, 4, 6]
    });

    expect(partOf(diagonal, 6, 1)).toEqual({ role: ROLE.winner, step: 2, endedBy: 0 });
    expect(partOf(diagonal, 2, 1)).toEqual({ role: ROLE.winner, step: 0, endedBy: 0 });
    expect(partOf(diagonal, 0, 2)).toEqual({ role: ROLE.dimmed, step: 0, endedBy: 0 });
  });

  it("lets every piece shrug after a draw", () => {
    const pieces = piecesOf(drawn).filter(item => item.kind === "piece");

    expect(pieces).toHaveLength(9);
    expect(pieces.every(item => item.role === ROLE.shrug && item.step === 0)).toBe(true);
  });

  it("gives a shadow the part of its piece", () => {
    const shadows = piecesOf(won).filter(item => item.kind === "shadow");

    expect(shadows.map(item => item.role)).toEqual([
      ROLE.winner,
      ROLE.winner,
      ROLE.winner,
      ROLE.dimmed,
      ROLE.dimmed
    ]);
  });
});

describe("trayOf", () => {
  it("is empty while another screen shows", () => {
    expect(trayOf(startingSession)).toEqual([]);
  });

  it("holds nine tiles, not lifted, with no result", () => {
    const [tray] = trayOf(on());

    expect(tray?.lifted).toBe(false);
    expect(tray?.mood).toBe(MOOD.none);
    expect(tray?.tiles.map(tile => tile.cell)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("shows the ghost on the empty tiles on the human's turn only", () => {
    const board = [1, 0, 0, 0, 2, 0, 0, 0, 0] as const;
    const [mine] = trayOf(on({ board: [...board], turn: 1 }));
    const [theirs] = trayOf(on({ board: [...board], turn: 2 }));

    expect(mine?.tiles.map(tile => tile.ghost)).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true
    ]);
    expect(mine?.tiles.some(tile => tile.dim)).toBe(false);
    expect(theirs?.tiles.some(tile => tile.ghost)).toBe(false);
    expect(theirs?.tiles.map(tile => tile.dim)).toEqual(mine?.tiles.map(tile => tile.ghost));
  });

  it("marks the winning tiles for either winner, with confetti only for the human", () => {
    const [mine] = trayOf(won);
    const [theirs] = trayOf(lost);

    expect(mine?.mood).toBe(MOOD.win);
    expect(mine?.tiles.filter(tile => tile.win).map(tile => tile.cell)).toEqual([0, 1, 2]);
    expect(mine?.tiles.filter(tile => tile.confetti).map(tile => tile.cell)).toEqual([0, 1, 2]);
    expect(theirs?.mood).toBe(MOOD.loss);
    expect(theirs?.tiles.filter(tile => tile.win).map(tile => tile.cell)).toEqual([3, 4, 5]);
    expect(theirs?.tiles.some(tile => tile.confetti)).toBe(false);
  });

  it("shows no ghost and dims nothing once the round has a result", () => {
    for (const session of [won, lost, drawn]) {
      const [tray] = trayOf(session);

      expect(tray?.tiles.some(tile => tile.ghost || tile.dim)).toBe(false);
    }

    expect(trayOf(drawn)[0]?.mood).toBe(MOOD.draw);
    expect(trayOf(drawn)[0]?.tiles.some(tile => tile.win)).toBe(false);
  });

  it("is lifted while the card is up", () => {
    expect(trayOf({ ...won, card: true })[0]?.lifted).toBe(true);
  });

  it("carries the mark of every tile", () => {
    expect(trayOf(lost)[0]?.tiles.map(tile => tile.mark)).toEqual(lost.board);
  });
});

describe("hudOf", () => {
  it("is empty while another screen shows", () => {
    expect(hudOf(startingSession)).toEqual([]);
  });

  it("shows the score on show, not the saved one", () => {
    const shown = { you: 2, draws: 1, bot: 1 };

    expect(hudOf(on({ shownScore: shown }))[0]?.score).toBe(shown);
  });

  it("says whose move it is while the round is open", () => {
    expect(hudOf(on({ turn: 1 }))[0]).toMatchObject({ pill: "yours", home: true });
    expect(hudOf(on({ turn: 2 }))[0]).toMatchObject({ pill: "bot", home: true });
  });

  it("says how the round ended and takes the Home button away once there is a result", () => {
    expect(hudOf(won)[0]).toMatchObject({ pill: "win", home: false });
    expect(hudOf(lost)[0]).toMatchObject({ pill: "loss", home: false });
    expect(hudOf(drawn)[0]).toMatchObject({ pill: "draw", home: false });
  });

  it("says nothing while the card is up, whoever won", () => {
    for (const session of [won, lost, drawn]) {
      expect(hudOf({ ...session, card: true })[0]).toMatchObject({ pill: "none", home: false });
    }
  });
});

describe("cardOf", () => {
  it("is empty while another screen shows, while the card is down, and without a result", () => {
    expect(cardOf({ ...won, card: true, screen: "home" })).toEqual([]);
    expect(cardOf(won)).toEqual([]);
    expect(cardOf(on({ card: true }))).toEqual([]);
  });
});
