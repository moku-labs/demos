/**
 * @file The settings popup (design §6 E2, D1): the plaque "Настройки", the X, three folder tabs
 * that stand on the parchment, and the pane under them — Music and Effects on two lines each (the
 * name and the percent, then −, a 10-segment level bar and +), the two language planks with a
 * check on the current one, or the player's name with the plank that opens the Rename popup — and
 * the "Сбросить прогресс" link with its wave.
 *
 * Which tab is open is local state of the component: the save never hears about it and no node
 * runs when the player looks around. The buttons that change something name the five outcomes;
 * the backdrop and the X answer `close`.
 */
import { type } from "@moku-labs/game";
import { defineComponent, tr } from "@core/kit";
import { Parchment, PopupScreen, Signboard } from "@shared";
import { linkStyle, linkWave, settingsTop, tabRow } from "../styles/styles";
import type { LocaleInput, Tab, VolumeInput } from "../types";
import { LanguagePane } from "../views/language-pane";
import { ProfilePane } from "../views/profile-pane";
import { TabButton } from "../views/tab-button";
import { buses, VolumeRow } from "../views/volume-row";

/** What the popup is shown with: the two volumes, the current language and the player's name. */
export type SettingsProps = { music: number; sfx: number; locale: string; name: string };

/**
 * The pane of the open tab.
 *
 * @param tab - The open tab.
 * @param props - What the popup is shown with.
 * @returns The rows of the pane.
 */
function paneOf(tab: Tab, props: SettingsProps) {
  if (tab === "language") return <LanguagePane locale={props.locale} />;
  if (tab === "profile") return <ProfilePane name={props.name} />;

  return buses.map(entry => (
    <VolumeRow
      bus={entry.bus}
      icon={entry.icon}
      volume={entry.bus === "music" ? props.music : props.sfx}
    />
  ));
}

export const Settings = defineComponent("Settings", {
  local: { tab: "audio" as Tab },
  outcomes: {
    volume: type<VolumeInput>(),
    setLocale: type<LocaleInput>(),
    rename: type(),
    reset: type(),
    close: type()
  },
  view: (props: SettingsProps, local) => (
    <PopupScreen id="settings" dismiss="close">
      <Signboard
        id="settingsBoard"
        title={tr("settings.title")}
        width={950}
        height={1060}
        top={settingsTop}
        hung
        close="close"
      >
        <Parchment id="settingsPane">
          {paneOf(local.tab, props)}
          <row key="settingsTabs" style={tabRow}>
            <TabButton id="tabSound" tab="audio" open={local.tab === "audio"} />
            <TabButton id="tabLanguage" tab="language" open={local.tab === "language"} />
            <TabButton id="tabProfile" tab="profile" open={local.tab === "profile"} />
          </row>
        </Parchment>
        <button key="settingsReset" intent="reset" style={linkStyle}>
          <text key="settingsResetLabel" style="ui.link" content={tr("settings.reset")} />
          <image key="settingsResetWave" texture="ui.link-wave" fit="fill" style={linkWave} />
        </button>
      </Signboard>
    </PopupScreen>
  )
});
