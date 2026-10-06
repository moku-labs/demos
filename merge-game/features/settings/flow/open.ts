/**
 * @file Rest node `open`: the settings popup with its three tabs, answered by the intents of its
 * controls.
 */
import type { Flow } from "@moku-labs/game";
import { type } from "@moku-labs/game";
import { defineNode, popup } from "@core/kit";
import { Settings } from "../popups/settings-popup";
import type { LocaleInput, VolumeInput } from "../types";
import { localeOf } from "./set-locale";
import { volumeOf } from "./set-volume";

/**
 * Rest node `open`: shows the settings popup and waits. A tab press is local state of the
 * component and never reaches this node; the backdrop and the X answer `close`.
 */
export const open = defineNode({
  rest: true,
  outcomes: {
    volume: type<VolumeInput>(),
    setLocale: type<LocaleInput>(),
    rename: type(),
    reset: type(),
    close: type()
  },
  run: async ({ player, fx, out }) => {
    const { audio, locale } = player.settings;
    const shown = { music: audio.music, sfx: audio.sfx, locale, name: player.name };
    const answered = (await fx(popup(Settings, shown))) as Flow.Answer | undefined;

    if (answered?.intent === "volume") return out.volume(volumeOf(answered.payload));
    if (answered?.intent === "setLocale") return out.setLocale(localeOf(answered.payload));
    if (answered?.intent === "rename") return out.rename();
    if (answered?.intent === "reset") return out.reset();

    return out.close();
  }
});
