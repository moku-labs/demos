/**
 * @file The tag a carried item puts on every item it could merge with.
 */
import { tag } from "@moku-labs/game";

/**
 * A legal target of the item in the hand. Written by `highlightLegal` while a drag runs, and
 * taken off again as soon as it is not legal any more.
 */
export const Highlighted = tag("Highlighted");
