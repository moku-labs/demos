/**
 * @file The screen half of the board feature: what the game brings to the screen plugins. The
 * logic half — the flows and the nodes — is composed through `flow.mainFlow` and does not change
 * because this feature exists.
 */
import { defineFeature } from "@core/kit";
import { sparkles, stars } from "@shared";
import { boardAssets } from "./assets";
import { boardSteam, steam } from "./effects/steam";
import {
  lookAnimations,
  mergeBurst,
  refuseShake,
  sawmillTap,
  toastBoardFull
} from "./motion/animations";
import { hud } from "./screens/board-screen";
import { boardScene } from "./screens/scene";
import { Generator } from "./world/components/generator";
import { Glow } from "./world/components/glow";
import { Highlighted } from "./world/components/highlighted";
import { Item } from "./world/components/item";
import { boardBadges } from "./world/projections/badges";
import { boardCells } from "./world/projections/cells";
import { boardClock } from "./world/projections/clock";
import { boardGenerators } from "./world/projections/generators";
import { boardGlows } from "./world/projections/glows";
import { boardItems } from "./world/projections/items";
import { boardSelection } from "./world/projections/selection";
import { glowCells } from "./world/systems/glow-cells";
import { highlightLegal } from "./world/systems/highlight-legal";
import { hoverLook } from "./world/systems/hover-look";

export { boardFlow } from "./flow";
export type * from "./types";

/**
 * The board on the screen: one scene, its eight projections, three systems, four components, the
 * animations of the board, the three particle effects, and the bundle that carries their pictures.
 * A game composes it next to `...screen` and `effectsPlugin`; a headless test leaves it out and the
 * same graph plays on.
 *
 * The feature name shares its namespace with the flow ids, and "board" is already the sub-flow of
 * the board, so the screen half of the same feature is registered under its own name.
 */
export const boardFeature = defineFeature("boardScreen", {
  scenes: [boardScene],
  projections: [
    boardCells,
    boardGlows,
    boardSelection,
    boardItems,
    boardGenerators,
    boardClock,
    boardBadges,
    boardSteam,
    hud
  ],
  systems: [highlightLegal, glowCells, hoverLook],
  components: [Item, Highlighted, Generator, Glow],
  animations: [
    toastBoardFull,
    mergeBurst,
    sawmillTap,
    refuseShake,
    lookAnimations.rest,
    lookAnimations.hover,
    lookAnimations.pressed
  ],
  emitters: [stars, sparkles, steam],
  assets: boardAssets
});
