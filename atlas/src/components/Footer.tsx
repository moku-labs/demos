/**
 * @file Footer (region B5) — pinned to the page bottom: the Atlas blurb + tech-stack line, three link
 * columns (Moku Core · Packages · Resources), and a base line. Static, editorial chrome — rendered
 * server-side as part of the SiteLayout and never swapped on SPA navigation. External links open in a
 * new tab; internal nav stays within the route map (the footer has no internal links today).
 */

/** One footer link column: a heading and its links. */
interface FooterColumn {
  /** Column heading. */
  title: string;
  /** Links in the column. */
  links: { label: string; href: string }[];
}

/** The three editorial link columns (design context §6 B5). */
const COLUMNS: readonly FooterColumn[] = [
  {
    title: "Moku Core",
    links: [
      { label: "Specification", href: "https://github.com/moku-labs/core/tree/main/specification" },
      { label: "Architecture", href: "https://github.com/moku-labs/core" },
      { label: "Releases", href: "https://github.com/moku-labs/core/releases" }
    ]
  },
  {
    title: "Packages",
    links: [
      { label: "@moku-labs/core", href: "https://www.npmjs.com/package/@moku-labs/core" },
      { label: "@moku-labs/web", href: "https://www.npmjs.com/package/@moku-labs/web" },
      { label: "@moku-labs/common", href: "https://www.npmjs.com/package/@moku-labs/common" }
    ]
  },
  {
    title: "Resources",
    links: [
      { label: "GitHub", href: "https://github.com/moku-labs" },
      { label: "npm", href: "https://www.npmjs.com/org/moku-labs" }
    ]
  }
];

/**
 * Render the editorial footer — blurb, tech-stack line, link columns, and base line.
 *
 * @returns The footer element.
 * @example
 * ```tsx
 * <Footer />
 * ```
 */
export function Footer() {
  return (
    <footer data-footer>
      <div data-foot-lead>
        <p data-foot-wordmark>
          Atlas<span data-stop>.</span>
        </p>
        <p data-foot-blurb>
          An editorial issue tracker — the newsroom for good software. Built as a Moku composition
          showcase.
        </p>
        <p data-foot-stack>
          Cloudflare Workers · Durable Objects · D1 · KV · R2 · Queues · Preact islands
        </p>
      </div>

      <div data-foot-cols>
        {COLUMNS.map(column => (
          <nav key={column.title} data-foot-col aria-label={column.title}>
            <h2 data-foot-col-title>{column.title}</h2>
            <ul>
              {column.links.map(link => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <p data-foot-base>© 2026 Atlas — a Moku demo. No rights reserved; copy freely.</p>
    </footer>
  );
}
