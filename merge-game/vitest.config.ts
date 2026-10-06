import { defineConfig } from "vitest/config";
import {
  EDITOR_SHARED_PACKAGES,
  editorEntries,
  editorRoot,
  engineEntries,
  engineSrc,
  entrySource,
  SHARED_PACKAGES
} from "./scripts/engine";

// `bun run test --engine <path>`: the runner sets MOKU_ENGINE_SRC, and every engine entry
// resolves to the working tree's source. Without it the tests run on node_modules as installed.
const engine = engineSrc();
const engineAlias =
  engine === undefined
    ? []
    : engineEntries(engine).map(entry => ({
        find: new RegExp(`^@moku-labs/game${entry === "index" ? "" : `/${entry}`}$`),
        replacement: entrySource(engine, entry)
      }));

// `bun run test:editor --editor <path>`: the runner sets MOKU_EDITOR_ROOT, and every editor
// entry resolves to the working tree's build. The tree then shares the demo's engine and preact.
const editor = editorRoot();
const editorAlias =
  editor === undefined
    ? []
    : Object.entries(editorEntries(editor)).map(([specifier, file]) => ({
        find: new RegExp(`^${specifier}$`),
        replacement: file
      }));
const dedupe = editor === undefined ? [...SHARED_PACKAGES] : [...EDITOR_SHARED_PACKAGES];

export default defineConfig({
  resolve: { alias: [...engineAlias, ...editorAlias], dedupe },
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
