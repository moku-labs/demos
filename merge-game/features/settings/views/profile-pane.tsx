/**
 * @file The profile pane of the settings popup: the name, rename and the reset of the progress.
 */
import { tr } from "@core/kit";
import { PlankButton } from "@shared";
import { profileColumn } from "../styles/styles";

/**
 * The name pane: the name the player chose, or a line that says there is none yet, over the wood
 * plank that opens the Rename popup.
 *
 * @param props - The name.
 * @param props.name - The name the save holds, `""` before the first rename.
 * @returns The column element.
 */
export function ProfilePane(props: { name: string }) {
  return (
    <column key="profilePane" style={profileColumn}>
      <text
        key="profileName"
        style="ui.tab"
        content={props.name === "" ? tr("settings.noName") : props.name}
      />
      <PlankButton
        id="profileRename"
        intent="rename"
        look="wood"
        size="full"
        label={tr("settings.rename")}
      />
    </column>
  );
}
