/**
 * @file The daily gift as a feature: the popup Home opens from its gift button. The node that
 * shows it is `flow/daily-gift.ts`, in the main flow; its strings live next to this file.
 */
import { defineFeature } from "@core/kit";
import { DailyGift } from "./popups/daily-gift";

export { dailyGift } from "./flow/daily-gift";

export const giftFeature = defineFeature("gift", { ui: [DailyGift] });
