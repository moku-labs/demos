/**
 * @file The door of the shared rules, `@shared/rules`: the pure helpers more than one feature's
 * rules and nodes need — the grid, the time that passed, the weighted draw and the wallet. Pure,
 * no engine import; a rules file imports only its siblings, `@core/types` and this door.
 */
export { applyEnergyRegen, elapse, nextDue } from "./elapse";
export { findFreeCell, itemAt, itemById, replaceItem, withItem, withoutItem } from "./grid";
export { drawWeighted } from "./random";
export { addToWallet } from "./wallet";
