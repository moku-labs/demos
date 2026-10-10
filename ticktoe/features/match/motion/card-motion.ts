/**
 * @file How the result card arrives and how the Board makes room for it.
 */
import type { World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { FRAME } from "../styles/board";

/**
 * How long the card takes to bounce in, from the design.
 */
export const CARD_IN_MS = 640;

/**
 * How long the card waits before it comes: the Board has to be most of its way up, so the piece
 * on top of the card never meets the bottom tiles.
 */
export const CARD_IN_DELAY_MS = 200;

/**
 * How long the Board takes to slide up, from the design.
 */
export const BOARD_LIFT_MS = 520;

/**
 * How far under its place the card starts: under the bottom edge of the frame.
 */
export const CARD_RISE = FRAME.height / 2;

/**
 * The piece on top of the card: how far over its seat it starts and how long it falls. It lands
 * while the card still rises, so it never climbs over its seat towards the tray.
 */
export const TOP_PIECE = { height: 200, ms: 320 } as const;

/**
 * The two buttons of the card: how long one pops in, how long after the card started the first
 * one does, and how much later the second one does.
 */
export const BUTTON_POP = { ms: 280, delayMs: 420, stepMs: 90 } as const;

/**
 * How far the card swings past its place when it arrives. Small on purpose: the piece on top of
 * the card rides the swing and must stay under the tray.
 */
const SWING = 0.7;

/**
 * The curve of the card's arrival: it runs a little past its place and comes back, by under 2%
 * of the way.
 *
 * @param time - Normalised time, 0..1.
 * @returns The eased fraction; just above 1 near the end.
 */
export function softBack(time: number): number {
  const left = time - 1;

  return 1 + (SWING + 1) * left ** 3 + SWING * left ** 2;
}

/**
 * The `change` hook of the tray's rest pose: the Board slides up when the card arrives.
 *
 * @param view - The view of the tray.
 * @returns The motion to the new rest pose.
 */
export function boardLift(view: World.ViewHandle<unknown>): World.Motion {
  return view.toRest(Transform, { ms: BOARD_LIFT_MS, ease: "inOut" });
}

/**
 * The `enter` hook of the card: it bounces in from below.
 *
 * @param view - The view of the card with the piece on top of it.
 * @returns The motion of the arrival.
 */
export function cardEnter(view: World.ViewHandle<unknown>): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y + CARD_RISE });

  return view.toRest(Transform, { ms: CARD_IN_MS, ease: softBack, delayMs: CARD_IN_DELAY_MS });
}

/**
 * The `enter` hook of the piece on top of the card: it drops onto the card.
 *
 * @param view - The view of the piece.
 * @returns The motion of the drop.
 */
export function topPieceEnter(view: World.ViewHandle<unknown>): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y - TOP_PIECE.height });

  return view.toRest(Transform, { ms: TOP_PIECE.ms, ease: "in", delayMs: CARD_IN_DELAY_MS });
}

/**
 * Builds the `enter` hook of a button of the card: it pops in after the card has arrived.
 *
 * @param place - The place of the button on the card, 0 for the first one.
 * @returns The hook.
 */
function buttonPop(place: number) {
  return (view: World.ViewHandle<unknown>): World.Motion => {
    view.set(Transform, { scale: 0 });

    return view.toRest(Transform, {
      ms: BUTTON_POP.ms,
      ease: "outBack",
      delayMs: CARD_IN_DELAY_MS + BUTTON_POP.delayMs + place * BUTTON_POP.stepMs
    });
  };
}

/**
 * The motion of the card with the piece on top of it.
 */
export const cardMotion = { enter: cardEnter };

/**
 * The motion of the piece on top of the card.
 */
export const topPieceMotion = { enter: topPieceEnter };

/**
 * The motions of the two buttons of the card, Play again first.
 */
export const buttonMotions = [{ enter: buttonPop(0) }, { enter: buttonPop(1) }] as const;
