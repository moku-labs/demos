/**
 * @file A folder tab of the settings popup.
 */
import { tr } from "@core/kit";
import { tabIdle, tabOpen } from "../styles/styles";
import type { Tab } from "../types";

/**
 * One folder tab. It writes the tab into the local state of the popup; the open one is the paper
 * tab that reaches down over the border of the parchment.
 *
 * @param props - The tab and whether it is on show.
 * @param props.id - The key of the button, `tab<Name>`; its words are keyed `<id>Label`.
 * @param props.tab - The tab.
 * @param props.open - Whether its pane is the one on show.
 * @returns The button element.
 */
export function TabButton(props: { id: string; tab: Tab; open: boolean }) {
  return (
    <button
      key={props.id}
      local={{ tab: props.tab }}
      state={{ selected: props.open }}
      style={props.open ? tabOpen : tabIdle}
    >
      <text
        key={`${props.id}Label`}
        style={props.open ? "ui.tab" : "ui.button"}
        content={tr("settings.tab", { tab: props.tab })}
      />
    </button>
  );
}
