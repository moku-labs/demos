/**
 * @file Flag — a pure inline-SVG national flag, selected by `code`. Used on the language cards
 * (A2) and the demo image/flag question (A5/Q2). No raster assets: every flag is hand-drawn so it
 * stays crisp at any size and themes purely off the spec geometry.
 */
import type { FlagProps } from "../types";

/**
 * Render a crisp inline-SVG national flag for one of the three supported codes.
 *
 * - `"us"` — 13 red/white stripes with a blue canton carrying a simple star field.
 * - `"ru"` — three equal horizontal bands: white / blue / red.
 * - `"bd"` — Bangladesh: a green field (`#006A4E`) with an off-centre red disc (`#F42A41`),
 *   the disc centre sitting ~43% from the left (slightly toward the hoist).
 *
 * Sizing is CSS-driven: the root carries `data-component="flag"` and a `data-code`, and the SVG
 * fills the box (default ~60×38). Override width/height via the cascade to scale it (the flag
 * question renders it large; the language cards render it small).
 *
 * @param props - The flag props.
 * @param props.code - Which flag to draw (`"us"`, `"ru"`, or `"bd"`).
 * @returns The flag element.
 * @example
 * ```tsx
 * <Flag code="us" />
 * <Flag code="bd" />
 * ```
 */
export function Flag({ code }: FlagProps) {
  return (
    <span data-component="flag" data-code={code} role="img" aria-label={LABELS[code]}>
      {code === "us" ? <UsFlag /> : code === "ru" ? <RuFlag /> : <BdFlag />}
    </span>
  );
}

/** Accessible names for each flag. */
const LABELS: Record<FlagProps["code"], string> = {
  us: "Flag of the United States",
  ru: "Flag of Russia",
  bd: "Flag of Bangladesh"
};

/** US flag — 13 stripes (7 red), a blue canton, and a tidy 5×4 star grid. */
function UsFlag() {
  return (
    <svg
      viewBox="0 0 76 40"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <title>Flag of the United States</title>
      <rect width="76" height="40" fill="#fff" />
      {US_STRIPE_OFFSETS.map(y => (
        <rect key={y} y={y} width="76" height={US_STRIPE_H} fill="#B22234" />
      ))}
      <rect width="33" height={US_STRIPE_H * 7} fill="#3C3B6E" />
      {US_STAR_ROWS.map((cy, row) =>
        US_STAR_COLS.map(cx => <circle key={`${row}-${cx}`} cx={cx} cy={cy} r="1.05" fill="#fff" />)
      )}
    </svg>
  );
}

/** Stripe height (13 stripes across 40px). */
const US_STRIPE_H = 40 / 13;
/** The y-offset of each of the 7 red stripes (even-indexed bands). */
const US_STRIPE_OFFSETS = [0, 2, 4, 6, 8, 10, 12].map(i => i * US_STRIPE_H);
/** Star-grid row centres (a simplified 4-row field). */
const US_STAR_ROWS = [4, 9, 14, 19];
/** Star-grid column centres (a simplified 5-column field). */
const US_STAR_COLS = [4, 10.5, 17, 23.5, 30];

/** Russian flag — three equal horizontal bands (white / blue / red). */
function RuFlag() {
  return (
    <svg viewBox="0 0 60 38" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <title>Flag of Russia</title>
      <rect width="60" height="38" fill="#fff" />
      <rect y="12.667" width="60" height="12.667" fill="#0039A6" />
      <rect y="25.333" width="60" height="12.667" fill="#D52B1E" />
    </svg>
  );
}

/** Bangladesh flag — green field with an off-centre red disc (centre ~43% from the hoist). */
function BdFlag() {
  return (
    <svg viewBox="0 0 60 38" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <title>Flag of Bangladesh</title>
      <rect width="60" height="38" fill="#006A4E" />
      <circle cx="25.8" cy="19" r="11.4" fill="#F42A41" />
    </svg>
  );
}
