/**
 * @file Icon — the one cohesive, enterprise-appropriate icon set (design context §4 "Customize" + §6
 * recurring components). A single inline-SVG component keyed by name: the curated element icons
 * (rocket, bug, target, flag, …) plus the UI glyphs (theme, filter, activity, close, …). All strokes
 * are `currentColor` so an icon inherits its context's ink or accent; sizing is via the `[data-icon]`
 * scope. Pure + island-safe (rendered server-side AND by islands).
 */

/** Every icon name Atlas can render — element-customization glyphs + UI glyphs. */
export type IconName =
  | "rocket"
  | "bug"
  | "target"
  | "flag"
  | "bolt"
  | "layers"
  | "cube"
  | "beaker"
  | "shield"
  | "gear"
  | "chart"
  | "calendar"
  | "database"
  | "terminal"
  | "compass"
  | "feather"
  | "sun"
  | "moon"
  | "filter"
  | "activity"
  | "close"
  | "plus"
  | "search"
  | "check"
  | "chevron-down"
  | "more"
  | "attach"
  | "clock"
  | "trash"
  | "google"
  | "apple";

/** The 24×24 path geometry for each icon (stroked with `currentColor`). */
const PATHS: Record<IconName, string> = {
  rocket:
    "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-3-3a16 16 0 0 1 9-12 9 9 0 0 1 6 6 16 16 0 0 1-12 9zm9-9 .01.01M9 12l3 3",
  bug: "M8 7a4 4 0 0 1 8 0M5 11h14M5 11v3a7 7 0 0 0 14 0v-3M12 11v10M4 9l2 2m14-2-2 2M4 18l2-1m14 1-2-1",
  target:
    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12h.01",
  flag: "M5 21V4m0 0 12 .5L14 9l3 4.5L5 14",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  layers: "M12 3 2 8l10 5 10-5zM2 14l10 5 10-5M2 11l10 5 10-5",
  cube: "M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12m0 9V12m9-4.5L12 12",
  beaker: "M9 3h6M10 3v6L5 19a1 1 0 0 0 1 1.5h12A1 1 0 0 0 19 19l-5-10V3M7.5 14h9",
  shield: "M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.07-.3.1-.7.1-1Z",
  chart: "M4 20V4M4 20h16M8 16v-4m4 4V8m4 8v-6",
  calendar:
    "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M8 3v4m8-4v4M4 11h16",
  database:
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  terminal:
    "M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M7 9l3 3-3 3m6 0h4",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m4 5-2.5 5.5L8 16l2.5-5.5z",
  feather: "M20 4a6 6 0 0 0-8 0L4 12v6h6l8-8a6 6 0 0 0 2-6M16 8 4 20M16 12H9",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4",
  moon: "M20 14a8 8 0 0 1-10.5-10.5A8 8 0 1 0 20 14Z",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 4 4",
  check: "M5 12.5 10 17l9-10",
  "chevron-down": "M6 9l6 6 6-6",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  attach:
    "M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.6 1.6 0 0 1-2.4-2.4l7.4-7.4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3.5 2",
  trash:
    "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7M10 11v6m4-6v6",
  google:
    "M21 12.2c0-.6 0-1.2-.1-1.7H12v3.5h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3a5.4 5.4 0 0 1-8-2.8H4v2.4A9 9 0 0 0 12 21M7 11.7a5.4 5.4 0 0 1 0-3.4V5.9H4a9 9 0 0 0 0 8.1M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.5A9 9 0 0 0 4 5.9l3 2.4a5.4 5.4 0 0 1 5-1.7",
  apple:
    "M16 3a4 4 0 0 1-1 3 3.5 3.5 0 0 1-3 1.4A4 4 0 0 1 13 4a4.3 4.3 0 0 1 3-1M18 16.5c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.4 3.2-4.1 3.2-1.5 0-1.9-1-4-1s-2.5 1-4 1c-1.7 0-3-1.6-4-3-2.8-4-3.1-8.7-1.4-11.2A5 5 0 0 1 9 7.8c1.6 0 2.6 1 4 1 1.3 0 2.1-1 4-1a5 5 0 0 1 3.7 2c-3.3 1.8-2.8 6.4 0 7.7"
};

/** Props for {@link Icon}. */
export interface IconProps {
  /** Which glyph to render. */
  name: IconName;
  /** Optional accessible label; when omitted the icon is `aria-hidden` (decorative). */
  label?: string;
}

/**
 * Render one icon as an inline SVG that inherits `currentColor` and is sized by its `[data-icon]` scope.
 *
 * @param props - The icon props.
 * @param props.name - Which glyph to render.
 * @param props.label - Optional accessible label (decorative when omitted).
 * @returns The icon element.
 * @example
 * ```tsx
 * <Icon name="rocket" />
 * <Icon name="activity" label="Activity" />
 * ```
 */
export function Icon({ name, label }: IconProps) {
  const filled = name === "more";
  return (
    <svg
      data-icon={name}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
