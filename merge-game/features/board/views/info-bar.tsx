/**
 * @file The sawmill info bar (design §6 B4, §7, p2): a light wooden plank right under the tray
 * that names the selected thing in ink. For the sawmill, and while nothing is selected: its icon, its
 * name, one pip per charge and the count, "3/4". The charges come from the save and the maximum
 * from the generator table, so the bar says what a tap would find. For a selected item: its
 * picture, its name and its level, "Доска · Уровень 3".
 */
import { tr } from "@core/kit";
import type { Player, Session } from "@core/state";
import { generatorId, tables } from "@core/tables";
import { nameOf, pictureOf } from "@shared";
import { barStyle, emptyPip, fullPip, iconStyle, pipsStyle } from "../styles/styles";
import type { InfoView, SawmillView } from "../types";
import { selectedOf } from "../world/projections/selection";

/**
 * Reads the sawmill out of the save.
 *
 * @param player - The saved player.
 * @returns Its charges and its maximum.
 */
export function sawmillOf(player: Player): SawmillView {
  const max = tables.generators[generatorId].maxCharges;

  return { charges: player.merge.generators[generatorId]?.charges ?? max, max };
}

/**
 * Reads what the bar shows: the selected item, or the sawmill when the sawmill or nothing is
 * selected.
 *
 * @param player - The saved player.
 * @param session - The session, which keeps the selected id.
 * @returns The view of the bar.
 */
export function infoOf(player: Player, session: Session): InfoView {
  const selected = selectedOf(player, session);

  if (selected?.kind === "item") {
    return { kind: "item", chain: selected.chain, level: selected.level };
  }

  return { kind: "sawmill", ...sawmillOf(player) };
}

/**
 * The words and pips of the sawmill: its name, one pip per charge and the count.
 *
 * @param sawmill - The charges of the sawmill.
 * @returns The elements after the icon.
 */
function sawmillWords(sawmill: SawmillView) {
  const { charges, max } = sawmill;

  return [
    <text key="infoName" style="ui.tab" content={tr("board.sawmill")} />,
    <row key="infoPips" style={pipsStyle}>
      {Array.from({ length: max }, (_unused, index) => (
        <stack key={`infoPip${index}`} style={index < charges ? fullPip : emptyPip} />
      ))}
    </row>,
    <text key="infoCharges" style="ui.tab" content={`${charges}/${max}`} />
  ];
}

/**
 * The words of a selected item: its name and its level.
 *
 * @param level - The level of the item, from 1.
 * @returns The elements after the icon.
 */
function itemWords(level: number) {
  return [
    <text key="infoName" style="ui.tab" content={tr("board.item", { item: nameOf(level) })} />,
    <text key="infoLevel" style="ui.tab" content={tr("board.level", { level })} />
  ];
}

/**
 * The info bar: what the selected thing is called, and how many taps the sawmill has left or
 * which level the item is.
 *
 * @param props - What the bar shows.
 * @param props.info - The sawmill or the selected item.
 * @returns The row element of the bar.
 */
export function InfoBar(props: { info: InfoView }) {
  const info = props.info;
  const texture = info.kind === "item" ? pictureOf(info.chain, info.level) : "board.generator";

  return (
    <row key="infoBar" style={barStyle}>
      <image key="infoIcon" texture={texture} style={iconStyle} />
      {info.kind === "item" ? itemWords(info.level) : sawmillWords(info)}
    </row>
  );
}
