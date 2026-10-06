/**
 * @file The door of the shared rules, `@shared/rules`: the pure helpers more than one feature's
 * rules and nodes need — the grid, the time that passed, the weighted draw, the wallet and
 * `applyRules`, which writes a rules result into the player draft. Pure, no engine import; a
 * rules file imports only its siblings, `@core/types` and this door.
 */
export { applyRules } from "./apply";
export { applyEnergyRegen, elapse, nextDue } from "./elapse";
export { findFreeCell, itemAt, itemById, replaceItem, withItem, withoutItem } from "./grid";
export { drawWeighted } from "./random";
export { addToWallet } from "./wallet";
