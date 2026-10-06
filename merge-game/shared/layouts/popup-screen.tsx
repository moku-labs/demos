/**
 * @file The frame of every popup: the dim backdrop and the board centred in the safe area.
 */
import { defineMotion } from "@moku-labs/game";
import { defineStyle } from "@core/kit";
import { safeEdges } from "../styles/tokens";

/** The root of a popup: the whole viewport, the board centred in the safe area. */
const popupScreen = defineStyle({
  width: "100%",
  height: "100%",
  direction: "column",
  align: "center",
  justify: "center",
  padding: safeEdges
});

/** The dim behind a popup: the whole screen, the safe area included. */
const backdropStyle = defineStyle({
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  fill: 0x1a_0f_08,
  alpha: 0.5,
  reason: "the backdrop dims the whole screen, the safe area included (design §5.7)"
});

/** The backdrop fades in and out; the second backdrop of a stacked popup darkens the first. */
const backdropMotion = defineMotion({
  states: { clear: { Shape: { alpha: 0 } } },
  transition: { ms: 200, ease: "out" },
  on: { enter: "clear", exit: "clear" }
});

/** What a popup screen takes. */
export type PopupScreenProps = {
  /** The popup's name: the root is keyed `<id>Screen`, the backdrop `<id>Backdrop`. */
  id: string;
  /**
   * The intent the backdrop answers, on a tap and on Escape. Left out, the popup is not
   * dismissable (Reward, Confirm).
   */
  dismiss?: string;
  /** The hung signboard of the popup. */
  children?: unknown;
};

/**
 * The root of every popup: the backdrop and the board. The backdrop comes first, so the board and
 * its buttons draw over it and a tap on the board never reaches it.
 *
 * @param props - The popup as its component declares it.
 * @returns The screen element.
 */
export function PopupScreen(props: PopupScreenProps) {
  const backdrop = `${props.id}Backdrop`;

  return (
    <screen key={`${props.id}Screen`} style={popupScreen}>
      {props.dismiss === undefined ? (
        <button key={backdrop} style={backdropStyle} motion={backdropMotion} />
      ) : (
        <button
          key={backdrop}
          intent={props.dismiss}
          escape
          style={backdropStyle}
          motion={backdropMotion}
        />
      )}
      {props.children as never}
    </screen>
  );
}
