/**
 * @file Transit node `enter`: the gear was pressed; the settings popup opens on its first tab.
 */
import { type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import { popupSound } from "@shared";

/**
 * Transit node `enter`: the settings come in, so their board swings in with its sound. The popup
 * of `open` is taken back after every step, so `open` itself plays nothing.
 */
export const enter = defineNode({
  outcomes: { done: type() },
  run: ({ fx, out }) => {
    void fx(popupSound);

    return out.done();
  }
});
