/**
 * @file The coin and the amount a reward pays.
 */
import { defineStyle } from "@core/kit";
import { theme } from "../styles/tokens";
import type { Label } from "../types";

/** The coin and the amount a reward pays, under its picture. */
const amountRow = defineStyle({ direction: "row", align: "center", gap: theme.space.md });

/** The coin in front of the amount. */
const amountCoin = defineStyle({ width: 104, height: 104 });

/**
 * The amount a reward pays (design §6 E1, E5): a coin, the big "+25", and the word after it when
 * the popup names one ("+50 монет").
 *
 * @param props - The amount.
 * @param props.id - The key of the row; the coin is keyed `<id>Coin`.
 * @param props.amountKey - The key of the big number.
 * @param props.amount - The number, already signed: `"+25"`.
 * @param props.unitKey - The key of the word after it; given with the word, and only then.
 * @param props.unit - The word after the number; none when left out.
 * @returns The row element.
 */
export function Amount(
  props: { id: string; amountKey: string; amount: string } & (
    | { unitKey?: undefined; unit?: undefined }
    | { unitKey: string; unit: Label }
  )
) {
  return (
    <row key={props.id} style={amountRow}>
      <icon key={`${props.id}Coin`} name="ui.icons.coin" style={amountCoin} />
      <text key={props.amountKey} style="ui.amount" content={props.amount} />
      {props.unit === undefined ? undefined : (
        <text key={props.unitKey} style="ui.title" content={props.unit} />
      )}
    </row>
  );
}
