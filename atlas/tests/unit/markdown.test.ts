/**
 * @file Unit tests for the Markdown → VNode renderer — XSS attack vectors first, then functionality.
 */
import { render } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/lib/markdown";

/**
 * Renders markdown source to its SSR HTML string for assertion.
 *
 * @param src - The markdown source to render.
 * @returns The serialized HTML of all block-level vnodes.
 */
function html(src: string): string {
  return renderMarkdown(src)
    .map(node => render(node))
    .join("");
}

describe("renderMarkdown — XSS hardening", () => {
  it("never emits a javascript: href (raw)", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
    expect(out).toContain("click");
  });

  it("never emits a javascript: href (mixed case JavaScript:)", () => {
    const out = html("[x](JavaScript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("never emits a javascript: href (leading whitespace)", () => {
    const out = html("[x](   javascript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it(String.raw`never emits a javascript: href (tab-obfuscated java\tscript:)`, () => {
    const out = html("[x](java\tscript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("never emits a javascript: href (newline-obfuscated)", () => {
    const out = html("[x](java\nscript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("never emits a javascript: href (HTML-entity tab &#9;)", () => {
    const out = html("[x](java&#9;script:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("never emits a javascript: href (percent-encoded colon)", () => {
    const out = html("[x](javascript%3Aalert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("never emits a data: href", () => {
    const out = html("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(out.toLowerCase()).not.toContain("data:");
    expect(out).not.toContain("href");
  });

  it("never emits a vbscript: href", () => {
    const out = html("[x](vbscript:msgbox(1))");
    expect(out.toLowerCase()).not.toContain("vbscript:");
    expect(out).not.toContain("href");
  });

  it("never emits a file: href", () => {
    const out = html("[x](file:///etc/passwd)");
    expect(out.toLowerCase()).not.toContain("file:");
    expect(out).not.toContain("href");
  });

  it("rejects a dangerous scheme nested inside other markdown", () => {
    const out = html("see **[bad](javascript:alert(1))** and *more*");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("href");
    expect(out).toContain("<strong>");
  });

  it("treats raw HTML in the source as literal text (no passthrough)", () => {
    const out = html("hello <script>alert(1)</script> <img src=x onerror=alert(1)>");
    // No live tags: every opening angle bracket is escaped to `&lt;`, so `<script>`/`<img>` never
    // become real elements and `onerror=` survives only as inert text content. (The closing `>` is
    // left as a literal `>` by the serializer, which is harmless in text.)
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script");
    expect(out).toContain("&lt;img");
  });

  it("escapes HTML inside a code span", () => {
    const out = html("`<script>alert(1)</script>`");
    expect(out).not.toContain("<script");
    expect(out).toContain("<code>");
  });
});

describe("renderMarkdown — functionality", () => {
  it("renders all six ATX heading levels", () => {
    const out = html("# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6");
    for (let level = 1; level <= 6; level += 1) {
      expect(out).toContain(`<h${level}>h${level}</h${level}>`);
    }
  });

  it("renders bold and italic", () => {
    const out = html("**bold** and *italic* and _also_");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<em>also</em>");
  });

  it("renders an unordered list", () => {
    const out = html("- one\n- two\n- three");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li>three</li>");
    expect(out).not.toContain("<ol>");
  });

  it("renders an ordered list", () => {
    const out = html("1. first\n2. second");
    expect(out).toContain("<ol>");
    expect(out).toContain("<li>first</li>");
    expect(out).toContain("<li>second</li>");
    expect(out).not.toContain("<ul>");
  });

  it("renders inline code", () => {
    const out = html("use `npm run build` now");
    expect(out).toContain("<code>npm run build</code>");
  });

  it("renders a fenced code block", () => {
    const out = html("```\nconst x = 1;\nconst y = 2;\n```");
    expect(out).toContain("<pre>");
    expect(out).toContain("<code>");
    expect(out).toContain("const x = 1;");
    expect(out).toContain("const y = 2;");
  });

  it("renders a valid https: link with a correct href", () => {
    const out = html("[docs](https://example.com/page)");
    expect(out).toContain('href="https://example.com/page"');
    expect(out).toContain(">docs</a>");
  });

  it("renders a valid mailto: link with a correct href", () => {
    const out = html("[mail](mailto:hi@example.com)");
    expect(out).toContain('href="mailto:hi@example.com"');
  });

  it("renders a relative link (no scheme) with an href", () => {
    const out = html("[home](/dashboard)");
    expect(out).toContain('href="/dashboard"');
  });

  it("renders paragraphs as <p> blocks", () => {
    const out = html("first para\n\nsecond para");
    expect(out).toContain("<p>first para</p>");
    expect(out).toContain("<p>second para</p>");
  });
});
