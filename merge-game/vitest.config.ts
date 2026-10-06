import { defineConfig } from "vitest/config";
import { engineEntries, engineSrc, entrySource, SHARED_PACKAGES } from "./scripts/engine";

// `bun run test --engine <path>`: the runner sets MOKU_ENGINE_SRC, and every engine entry
// resolves to the working tree's source. Without it the tests run on node_modules as installed.
const engine = engineSrc();
const alias =
  engine === undefined
    ? []
    : engineEntries(engine).map(entry => ({
        find: new RegExp(`^@moku-labs/game${entry === "index" ? "" : `/${entry}`}$`),
        replacement: entrySource(engine, entry)
      }));

export default defineConfig({
  resolve: { alias, dedupe: [...SHARED_PACKAGES] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "__tests__/**/*.test.{ts,tsx}",
            "rules/__tests__/**/*.test.{ts,tsx}",
            "features/**/__tests__/**/*.test.{ts,tsx}"
          ]
        }
      },
      {
        extends: true,
        test: { name: "e2e", include: ["tests/e2e/**/*.e2e.ts"] }
      },
      {
        extends: true,
        test: { name: "editor", include: ["tests/editor/**/*.editor.ts"] }
      }
    ]
  }
});
