/**
 * @file Icon — the one cohesive, enterprise-appropriate icon set (design context §4 "Customize" + §6
 * recurring components). A single inline-SVG component keyed by name: the curated element icons
 * (rocket, bug, target, flag, …) plus the UI glyphs (theme, filter, activity, close, logout, …). All strokes
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
  | "grip"
  | "attach"
  | "clock"
  | "trash"
  | "logout"
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
  more: "M6 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M16 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0",
  grip: "M9 8h.01M9 12h.01M9 16h.01M15 8h.01M15 12h.01M15 16h.01",
  attach:
    "M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.6 1.6 0 0 1-2.4-2.4l7.4-7.4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3.5 2",
  trash:
    "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7M10 11v6m4-6v6",
  logout: "M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11",
  // google is rendered as the 4-colour brand mark (see GOOGLE_SEGMENTS); this single-colour fallback
  // is kept only to satisfy the Record<IconName, string> contract and is never used by the renderer.
  google:
    "M23 12.26c0-.81-.07-1.59-.21-2.34H12v4.43h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72C21.78 18.72 23 15.8 23 12.26z",
  apple:
    "M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-1.72-.92-2.83-.9-1.46.02-2.8.85-3.55 2.16-1.51 2.63-.39 6.52 1.09 8.66.72 1.05 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.88-2.31-3.48M14.6 4.42c.6-.73 1.01-1.74.9-2.75-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.23"
};

/** The four colour segments of the Google "G" brand mark (rendered in place of a single currentColor). */
const GOOGLE_SEGMENTS: readonly { fill: string; d: string }[] = [
  {
    fill: "#4285F4",
    d: "M23 12.26c0-.81-.07-1.59-.21-2.34H12v4.43h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72C21.78 18.72 23 15.8 23 12.26z"
  },
  {
    fill: "#34A853",
    d: "M12 23c3.11 0 5.71-1.03 7.61-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.89 1.1-2.99 0-5.53-2.02-6.43-4.74H1.73v2.98C3.62 20.41 7.51 23 12 23z"
  },
  {
    fill: "#FBBC05",
    d: "M5.57 13.68c-.23-.69-.36-1.42-.36-2.18s.13-1.49.36-2.18V6.34H1.73C.96 7.87.5 9.59.5 11.5s.46 3.63 1.23 5.16l3.84-2.98z"
  },
  {
    fill: "#EA4335",
    d: "M12 5.58c1.69 0 3.2.58 4.39 1.72l3.29-3.29C17.71 2.16 15.11 1 12 1 7.51 1 3.62 3.59 1.73 6.34l3.84 2.98C6.47 7.6 9.01 5.58 12 5.58z"
  }
];

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
  // Google renders as its 4-colour brand mark (each segment its own brand fill), not a flat glyph.
  if (name === "google") {
    return (
      <svg
        data-icon="google"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : "true"}
      >
        {GOOGLE_SEGMENTS.map(segment => (
          <path key={segment.fill} fill={segment.fill} d={segment.d} />
        ))}
      </svg>
    );
  }

  const filled = name === "more" || name === "grip" || name === "apple";
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
