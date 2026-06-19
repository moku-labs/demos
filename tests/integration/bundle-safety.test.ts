/**
 * @file Bundle-safety (web Rule R3) — statically crawls the browser entry's runtime import graph and
 * asserts it never reaches the worker graph. A value import of `@moku-labs/worker`, `src/worker.ts`,
 * `src/board.ts`, or the `tracker` plugin would drag Cloudflare-only runtime code (and its node:fs
 * dependency) into the client bundle. Type-only imports are erased by the bundler, so they are
 * ignored — only value edges are followed.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- named path helpers read clearer than path.*
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");
const ENTRY = resolve(SRC, "spa.tsx");
const SPEC_RE = /\bfrom\s*["']([^"']+)["']/;
const SIDE_EFFECT_RE = /^import\s+["']([^"']+)["']/;

/** True when `path` is an actual file (not a directory — `./islands` resolves to a dir). */
function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Resolve a relative import to an on-disk source file, trying the usual extensions. */
function resolveRelative(fromFile: string, spec: string): string | undefined {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find(candidate => isFile(candidate));
}

/**
 * Value-import specifiers in a module. Splits on `;` (this repo always uses semicolons) so multi-line
 * imports are one statement, then skips erased `import type` / `export type` statements.
 */
function valueImports(code: string): string[] {
  const withoutComments = code.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
  const specs: string[] = [];
  for (const statement of withoutComments.split(";")) {
    const trimmed = statement.trim();
    if (trimmed.startsWith("import type") || trimmed.startsWith("export type")) continue;
    if (!trimmed.startsWith("import") && !trimmed.startsWith("export")) continue;
    const spec = SPEC_RE.exec(trimmed)?.[1] ?? SIDE_EFFECT_RE.exec(trimmed)?.[1];
    if (spec) specs.push(spec);
  }
  return specs;
}

/** Crawl the runtime import graph from `entry`, returning reached local files + bare specifiers. */
function crawl(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    files.add(file);

    for (const spec of valueImports(readFileSync(file, "utf8"))) {
      if (spec.endsWith(".css")) continue; // stylesheet leaf
      if (!spec.startsWith(".")) {
        bare.add(spec);
        continue;
      }
      const next = resolveRelative(file, spec);
      if (next) queue.push(next);
    }
  }
  return { files, bare };
}

describe("bundle safety (R3): browser graph excludes the worker graph", () => {
  const { files, bare } = crawl(ENTRY);

  it("crawled a non-trivial browser graph from spa.tsx", () => {
    expect(files.size).toBeGreaterThan(5);
  });

  it("never reaches src/worker.ts, src/board.ts, or the tracker plugin", () => {
    // Exact root paths — src/islands/board.ts (the board island) is a legitimate browser module and
    // must NOT be confused with src/board.ts (the Durable Object).
    const workerEntry = resolve(SRC, "worker.ts");
    const boardDo = resolve(SRC, "board.ts");
    const trackerDir = resolve(SRC, "plugins", "tracker");
    const forbidden = [...files].filter(
      file => file === workerEntry || file === boardDo || file.startsWith(`${trackerDir}/`)
    );
    expect(forbidden).toEqual([]);
  });

  it("never value-imports @moku-labs/worker", () => {
    const workerImports = [...bare].filter(spec => spec.startsWith("@moku-labs/worker"));
    expect(workerImports).toEqual([]);
  });

  it("does import the browser framework entry (@moku-labs/web/browser)", () => {
    expect([...bare].some(spec => spec.startsWith("@moku-labs/web/browser"))).toBe(true);
  });
});
