/**
 * @file The orders feature: the "Готово!" stamp a finished order gets, and the bundle with the card,
 * the rope and the sound a finished order plays. Its nodes (`flow/give-to-order.ts`,
 * `flow/deliver.ts`) are nodes of the board flow, and its strip of cards is drawn by the board
 * screen. The reward popup a finished order opens is the `reward` feature's. The cards sway by the
 * loop motion of their element (`motion/motions.ts`).
 */
import { defineFeature } from "@core/kit";
import { ordersAssets } from "./assets";
import { deliverStamp } from "./motion/animations";

export { deliver } from "./flow/deliver";
export { giveToOrder } from "./flow/give-to-order";
export type { OrderCardView } from "./views/order-card";
export { acceptedItemsOf, orderCardsOf, OrderStrip } from "./views/order-card";

export const ordersFeature = defineFeature("orders", {
  animations: [deliverStamp],
  assets: ordersAssets
});
