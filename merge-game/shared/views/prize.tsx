/**
 * @file A prize on rays: the picture of a reward, or the empty energy in its sky disc.
 */
import { defineStyle } from "@core/kit";
import type { AssetKey } from "@generated/assets";
import { theme } from "../styles/tokens";

/** The box of a prize on rays: the rays shine past it, the picture sits in its middle. */
const prizeStyle = defineStyle({ width: 400, height: 400, align: "center", justify: "center" });

/** The honey rays behind a reward: wider than the box, so they fade out over the board. */
const raysStyle = defineStyle({
  position: "absolute",
  left: -90,
  top: -90,
  width: 580,
  height: 580,
  reason: "the rays shine behind the prize, past its box (design §6 E1, E5)"
});

/** The picture of a reward: the delivered item or the gift, on the rays with no disc. */
const prizePictureStyle = defineStyle({ width: 300, height: 300 });

/** The pale-sky disc the empty energy sits in (design §6 E4). */
const skyDiscStyle = defineStyle({
  width: 320,
  height: 320,
  radius: 160,
  fill: 0xcf_e8_f5,
  stroke: theme.color.ink,
  strokeWidth: 8,
  align: "center",
  justify: "center"
});

/** The bolt in the sky disc. */
const discPictureStyle = defineStyle({ width: 210, height: 210 });

/** What a prize takes. */
export type PrizeProps = {
  /** The key of the prize; the coins of a claim fly from it. Its parts are `<id>Rays`, `<id>Disc`, `<id>Picture`. */
  id: string;
  /** The picture. */
  picture: AssetKey;
  /**
   * How the picture is shown: `"rays"`, a reward on the honey rays with no disc (Reward, Daily
   * gift), or `"sky"`, in the pale-sky disc (Out of energy).
   */
  look: "rays" | "sky";
};

/**
 * A prize (design §6 E1, E4, E5): the delivered item or the gift on its rays, or the bolt in its
 * sky disc.
 *
 * @param props - The prize as the popup declares it.
 * @returns The stack element.
 */
export function Prize(props: PrizeProps) {
  if (props.look === "sky") {
    return (
      <stack key={props.id} style={skyDiscStyle}>
        <image key={`${props.id}Picture`} texture={props.picture} style={discPictureStyle} />
      </stack>
    );
  }

  return (
    <stack key={props.id} style={prizeStyle}>
      <image key={`${props.id}Rays`} texture="ui.fx.fx-rays" style={raysStyle} />
      <image key={`${props.id}Picture`} texture={props.picture} style={prizePictureStyle} />
    </stack>
  );
}
