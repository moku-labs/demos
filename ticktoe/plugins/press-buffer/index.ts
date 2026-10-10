/**
 * @file The plugin `pressBuffer`, Standard tier: keeps the last press a closed gate refused and
 * answers the gate with it when it opens. Wiring only; the logic is in `handlers.ts`.
 */
import {
  createPlugin,
  flowPlugin,
  inputPlugin,
  Tappable,
  timePlugin,
  worldPlugin
} from "@moku-labs/game";
import { onEdge, onFrame, onStop, onTap } from "./handlers";
import { createPressBufferState } from "./state";
import type { Config } from "./types";

const defaultConfig: Config = { keepMs: 500 };

/**
 * The plugin `pressBuffer`. A transit node closes the gate while it awaits its animation, and a
 * press made then is refused without a trace: the button shows its pressed look and nothing
 * starts. The plugin hears every tap before the gate is asked, keeps the last one a closed gate
 * refuses, and answers the gate with it in the first frame the gate is open and lists its intent.
 * A press older than `keepMs` is forgotten. It declares no event and has no API.
 *
 * @see README.md
 */
export const pressBufferPlugin = createPlugin("pressBuffer", {
  // inputPlugin is here for `onTap`, worldPlugin for the `Tappable` of the tapped view,
  // timePlugin for the frame step and its clock, flowPlugin for the gate and `flow:edge`.
  depends: [timePlugin, flowPlugin, worldPlugin, inputPlugin],
  config: defaultConfig,
  createState: createPressBufferState,
  // @no-resource-check — onStart registers the tap listener and the frame step; onStop removes both.
  onStart: ctx => {
    const time = ctx.require(timePlugin);
    const flow = ctx.require(flowPlugin);
    const { ecs } = ctx.require(worldPlugin);

    ctx.state.off = [
      ctx
        .require(inputPlugin)
        .onTap(entity =>
          onTap(ctx.state, ecs.get(entity, Tappable), flow, time.snapshot().elapsed)
        ),
      // Registered on start, after the step of `input` in the same phase: the presses of a frame
      // are heard first, then the kept one is offered.
      time.onFrame("input", frame => onFrame(ctx.state, ctx.config.keepMs, flow, frame.elapsed))
    ];
  },
  onStop: ({ state }) => onStop(state),
  hooks: ctx => ({
    "flow:edge": payload => onEdge(ctx.state, payload)
  })
});
