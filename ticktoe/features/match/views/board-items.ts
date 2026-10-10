/**
 * @file What the four projections of the Board read from the session: plain items, one function
 * per projection. The views draw them; nothing here knows a sprite or a style.
 */
import type { Session } from "@core/state";
import type { Cell, Mark, Score } from "@core/types";
import { pieceKey, shadowKey } from "../names";
import { lastMover } from "../rules";
import { MOOD, ROLE } from "../world/components/markers";

/**
 * One tile of the tray: its cell, the mark on it, and what the round makes of it. A tile shows
 * the ghost while the human may take it, is dimmed while the bot thinks, is a winning tile while
 * it is in the line, and throws confetti when the line is the human's.
 */
export type TileItem = {
  cell: number;
  mark: Cell;
  ghost: boolean;
  dim: boolean;
  win: boolean;
  confetti: boolean;
};

/**
 * The tray: its nine tiles, whether the result card has lifted it, and how the round ended.
 */
export type TrayItem = { lifted: boolean; mood: number; tiles: TileItem[] };

/**
 * The score row, the turn pill and the Home button: the score on show, what the pill says, and
 * whether the button is there. The pill says whose move it is, or how the round ended while it
 * celebrates. It says nothing, and is away, while the result card is up.
 */
export type HudItem = {
  score: Score;
  pill: "none" | "yours" | "bot" | "win" | "loss" | "draw";
  home: boolean;
};

/**
 * The result card: how the round ended.
 */
export type CardItem = { result: "win" | "loss" | "draw" };

/**
 * A piece on the Board, or the ground shadow under it: its key, its cell and mark, its part in the
 * result and, for a winner, its place in the line. A piece that shrugs also carries the mark of
 * the piece that ended the round, because its shrug waits for that one. Every other part has 0
 * there: a win is always ended by an X and a loss by an O, only a draw by either.
 */
export type PieceItem = {
  key: string;
  kind: "piece" | "shadow";
  cell: number;
  mark: Mark;
  role: number;
  step: number;
  endedBy: Cell;
};

/**
 * The nine cells, in order.
 */
const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Every part a piece can have in a result, with the place in the line a winner can have and the
 * mark a draw can end on.
 */
const PARTS = [
  { role: ROLE.none, step: 0, endedBy: 0 },
  { role: ROLE.winner, step: 0, endedBy: 0 },
  { role: ROLE.winner, step: 1, endedBy: 0 },
  { role: ROLE.winner, step: 2, endedBy: 0 },
  { role: ROLE.dimmed, step: 0, endedBy: 0 },
  { role: ROLE.sagged, step: 0, endedBy: 0 },
  { role: ROLE.shrug, step: 0, endedBy: 1 },
  { role: ROLE.shrug, step: 0, endedBy: 2 }
] as const;

/**
 * The name of one entry of the piece table.
 *
 * @param item - The fields that tell one piece from another.
 * @returns The name.
 */
function nameOf(item: Omit<PieceItem, "key">): string {
  return `${item.kind}:${item.cell}:${item.mark}:${item.role}:${item.step}:${item.endedBy}`;
}

/**
 * Builds the table of every piece and shadow the Board can show: one frozen object per kind, cell,
 * mark and part.
 *
 * @returns The table, by entry name.
 */
function buildPieces(): Readonly<Record<string, PieceItem>> {
  const table: Record<string, PieceItem> = {};

  for (const cell of CELLS) {
    for (const mark of [1, 2] as const) {
      for (const part of PARTS) {
        const piece = { kind: "piece", cell, mark, ...part } as const;
        const shadow = { kind: "shadow", cell, mark, ...part } as const;

        table[nameOf(piece)] = Object.freeze({ key: pieceKey(cell), ...piece });
        table[nameOf(shadow)] = Object.freeze({ key: shadowKey(cell), ...shadow });
      }
    }
  }

  return Object.freeze(table);
}

/**
 * Every piece and shadow the Board can show. A projection hands out these objects and never a new
 * one: the engine leaves a view alone while its item is the same object, so a commit that does not
 * touch a piece does not cut its drop short.
 */
const PIECES = buildPieces();

/**
 * The part of the piece on a cell in the result of the round.
 *
 * @param session - The session.
 * @param cell - The cell of the piece.
 * @param mark - The mark of the piece.
 * @returns The role, for a winner the place in the line, and for a shrug the mark of the piece
 *   that ended the draw.
 */
export function partOf(
  session: Session,
  cell: number,
  mark: Mark
): { role: number; step: number; endedBy: Cell } {
  const place = session.winLine.indexOf(cell);

  if (session.result === "win") {
    return place === -1
      ? { role: ROLE.dimmed, step: 0, endedBy: 0 }
      : { role: ROLE.winner, step: place, endedBy: 0 };
  }

  if (session.result === "loss" && mark === 1) return { role: ROLE.sagged, step: 0, endedBy: 0 };

  if (session.result === "draw") {
    return { role: ROLE.shrug, step: 0, endedBy: lastMover(session.turn) };
  }

  return { role: ROLE.none, step: 0, endedBy: 0 };
}

/**
 * The pieces on the Board with their shadows: for every taken cell the shadow, then the piece.
 * Nothing while another screen shows.
 *
 * @param session - The session.
 * @returns The items, each one an object of the piece table.
 */
export function piecesOf(session: Session): PieceItem[] {
  const items: PieceItem[] = [];

  if (session.screen !== "board") return items;

  for (const [cell, mark] of session.board.entries()) {
    if (mark === 0) continue;

    const part = partOf(session, cell, mark);
    const shadow = PIECES[nameOf({ kind: "shadow", cell, mark, ...part })];
    const piece = PIECES[nameOf({ kind: "piece", cell, mark, ...part })];

    if (shadow !== undefined && piece !== undefined) items.push(shadow, piece);
  }

  return items;
}

/**
 * The tray as the session has it. Nothing while another screen shows.
 *
 * @param session - The session.
 * @returns One tray, or none.
 */
export function trayOf(session: Session): TrayItem[] {
  if (session.screen !== "board") return [];

  const open = session.result === "none";
  const tiles = session.board.map((mark, cell) => {
    const win = session.winLine.includes(cell);

    return {
      cell,
      mark,
      ghost: open && mark === 0 && session.turn === 1,
      dim: open && mark === 0 && session.turn === 2,
      win,
      confetti: win && session.result === "win"
    };
  });

  return [{ lifted: session.card, mood: MOOD[session.result], tiles }];
}

/**
 * The score row, the pill and the Home button as the session has them. The pill says whose move
 * it is while the round is open and how it ended after that, and nothing while the card is up; the
 * Home button is away once the round has a result, because nothing answers it until the card is
 * up. Nothing while another screen shows.
 *
 * @param session - The session.
 * @returns One item, or none.
 */
export function hudOf(session: Session): HudItem[] {
  if (session.screen !== "board") return [];

  const open = session.result === "none";
  const turn = session.turn === 1 ? "yours" : "bot";
  const says = open ? turn : session.result;

  return [{ score: session.shownScore, pill: session.card ? "none" : says, home: open }];
}

/**
 * The result card as the session has it: there while the card is up and the round has a result.
 * Nothing while another screen shows.
 *
 * @param session - The session.
 * @returns One card, or none.
 */
export function cardOf(session: Session): CardItem[] {
  const isCardUp = session.screen === "board" && session.card;

  if (!isCardUp || session.result === "none") return [];

  return [{ result: session.result }];
}
