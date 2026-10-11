/**
 * @file What the projections of the stage read from the state: plain items.
 */
import type { Player, Session } from "@core/state";
import type { Level } from "@core/types";
import { levelIndex } from "../rules/levels";

/**
 * What the hills read: the screen that shows.
 */
export type HillsItem = { readonly screen: Session["screen"] };

/**
 * What Home reads: the saved level and its place in the picker, 0 for the first option. The place
 * is worked out here, from the rules, so the view only draws.
 */
export type HomeItem = { readonly level: Level; readonly index: number };

/**
 * The hills as the session has them: always there, on the screen that shows.
 *
 * @param session - The session.
 * @returns The item of that screen.
 */
export function hillsOf(session: Session): HillsItem {
  return { screen: session.screen };
}

/**
 * Which end of their slide the hills show on a screen.
 *
 * @param screen - The screen that shows.
 * @returns 0 for Home, 1 for the Board.
 */
export function parallaxAt(screen: Session["screen"]): number {
  return screen === "board" ? 1 : 0;
}

/**
 * Home as the state has it: there while the screen is Home, with the saved level and its place.
 * Nothing while the Board shows.
 *
 * @param player - The saved player.
 * @param session - The session.
 * @returns One item, or none.
 */
export function homeOf(player: Player, session: Session): HomeItem[] {
  if (session.screen !== "home") return [];

  return [{ level: player.level, index: levelIndex(player.level) }];
}
