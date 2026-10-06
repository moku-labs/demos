/**
 * @file The config of the `uiSounds` plugin.
 */

/**
 * What the app passes in `pluginConfigs.uiSounds`: the sound a control plays when it is tapped.
 *
 * @example
 * ```ts
 * const config: UiSoundsConfig = { click: "ui.click" };
 * ```
 */
export type UiSoundsConfig = {
  /** The asset key of the click. `"ui.click"` by default, the click of the shared layer. */
  click: string;
};
