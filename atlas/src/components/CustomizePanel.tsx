/**
 * @file CustomizePanel (overlay C3) — the Customize popover opened from any "⋯ → Customize" (design
 * context §4 + §6 C3). A curated colour palette (≈10 token-built swatches) shown as selectable dots,
 * and a cohesive icon grid drawn from the customize {@link Icon} set, plus a "Remove icon" option.
 * The element updates live. A popover (a centred card over a dimmed scrim) on desktop, a bottom sheet
 * on phones. Pure + SSR shared markup: the Phase-C customize island re-renders it with the element's
 * current colour/icon via `h(CustomizePanel, props)` and wires the picks off the
 * `data-action`/`data-value` hooks; the scrim carries `data-action="close"` for dismissal.
 */

import type { IconName } from "./Icon";
import { Icon } from "./Icon";

/** One curated palette swatch — a label plus the CSS custom property it paints with. */
interface Swatch {
  /** The stored colour token name (e.g. `--accent`), carried as the pick's value. */
  token: string;
  /** Accessible name for the swatch. */
  name: string;
}

/** The curated colour palette — ten editorial swatches, all built from existing tokens. */
const PALETTE: readonly Swatch[] = [
  { token: "--accent", name: "Vermilion" },
  { token: "--label-bug", name: "Bug red" },
  { token: "--label-amber", name: "Amber" },
  { token: "--label-green", name: "Green" },
  { token: "--label-docs", name: "Cyan" },
  { token: "--label-feature", name: "Blue" },
  { token: "--label-research", name: "Violet" },
  { token: "--label-design", name: "Pink" },
  { token: "--label-chore", name: "Slate" },
  { token: "--avatar-ak", name: "Steel" }
];

/** The cohesive customize icon grid — the enterprise-appropriate element glyphs (design context §4). */
const ICONS: readonly IconName[] = [
  "rocket",
  "bug",
  "target",
  "flag",
  "bolt",
  "layers",
  "cube",
  "beaker",
  "shield",
  "gear",
  "chart",
  "calendar",
  "database",
  "terminal",
  "compass",
  "feather"
];

/** Props for {@link CustomizePanel}. */
export interface CustomizePanelProps {
  /** The element being customized (e.g. "Platform"), shown in the header. */
  elementLabel: string;
  /** The element's current colour token, or `null`/absent when unset. */
  color?: string | null;
  /** The element's current icon name, or `null`/absent when unset. */
  icon?: string | null;
}

/**
 * Render the customize popover — header, colour palette, and the icon grid with "Remove icon".
 *
 * @param props - The customize-panel props.
 * @param props.elementLabel - The element being customized, shown in the header.
 * @param props.color - The element's current colour token (drives the selected swatch).
 * @param props.icon - The element's current icon name (drives the selected glyph).
 * @returns The customize popover element.
 * @example
 * ```tsx
 * <CustomizePanel elementLabel="Platform" color="--accent" icon="rocket" />
 * ```
 */
export function CustomizePanel({ elementLabel, color = null, icon = null }: CustomizePanelProps) {
  return (
    <div data-customize-panel>
      <div data-scrim data-action="close" aria-hidden="true" />
      <div data-customize-card role="dialog" aria-label={`Customize ${elementLabel}`}>
        <header data-customize-head>
          <span data-customize-eyebrow>Customize</span>
          <h2 data-customize-title>{elementLabel}</h2>
        </header>

        <section data-customize-section aria-label="Colour">
          <h3 data-customize-heading>Colour</h3>
          <div data-swatch-grid>
            {PALETTE.map(swatch => (
              <button
                key={swatch.token}
                type="button"
                data-swatch
                data-action="pick-color"
                data-value={swatch.token}
                data-selected={color === swatch.token ? "" : undefined}
                style={`--swatch:var(${swatch.token})`}
                aria-pressed={color === swatch.token ? "true" : "false"}
                aria-label={swatch.name}
                title={swatch.name}
              >
                <span data-swatch-dot aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section data-customize-section aria-label="Icon">
          <div data-customize-heading-row>
            <h3 data-customize-heading>Icon</h3>
            <button
              type="button"
              data-remove-icon
              data-action="remove-icon"
              data-selected={icon ? undefined : ""}
            >
              Remove icon
            </button>
          </div>
          <div data-icon-grid>
            {ICONS.map(name => (
              <button
                key={name}
                type="button"
                data-icon-cell
                data-action="pick-icon"
                data-value={name}
                data-selected={icon === name ? "" : undefined}
                aria-pressed={icon === name ? "true" : "false"}
                aria-label={name}
                title={name}
              >
                <Icon name={name} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
