import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The layer aliases of tsconfig.json `paths`, which vitest does not read: the same table, here.
const at = (folder: string) => fileURLToPath(new URL(folder, import.meta.url));
const layerAlias = [
  { find: /^@core\/(.*)$/, replacement: `${at("./core/")}$1` },
  { find: /^@shared$/, replacement: at("./shared/index.ts") },
  { find: /^@shared\/rules$/, replacement: at("./shared/rules/index.ts") },
  { find: /^@features$/, replacement: at("./features/index.ts") },
  { find: /^@features\/([^/]+)$/, replacement: `${at("./features/")}$1/index.ts` },
  { find: /^@plugins$/, replacement: at("./plugins/index.ts") },
  { find: /^@generated\/(.*)$/, replacement: `${at("./generated/")}$1` },
  { find: /^@tests\/(.*)$/, replacement: `${at("./tests/")}$1` }
];

export default defineConfig({
  // The engine, the editor and the game share one Pixi, one core and one common: two copies break.
  resolve: { alias: layerAlias, dedupe: ["pixi.js", "@moku-labs/core", "@moku-labs/common"] },
  test: {
    // A green run prints one dot per test and the summary. A red run adds the failed tests with
    // their diffs, and on GitHub each of them is an annotation of the pull request as well.
    reporters: process.env.GITHUB_ACTIONS === "true" ? ["dot", "github-actions"] : ["dot"],
    coverage: {
      provider: "istanbul",
      include: ["index.ts", "game.ts", "{core,shared,features,plugins}/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.tsx"],
      // The four numbers of the whole game. `--coverage.reporter=text` prints the table per file.
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }
    },
    projects: [
      {
        // `bun run test`: the headless tests of the game, in plain Bun.
        extends: true,
        test: {
          name: "unit",
          include: [
            "tests/**/*.test.ts",
            "**/__tests__/**/*.test.ts",
            "**/__tests__/isolated/*.isolated.ts"
          ]
        }
      },
      {
        // `bun run test:editor`: the editor on the game, its three cores over the real wire.
        extends: true,
        test: { name: "editor", include: ["tests/editor/**/*.editor.ts"] }
      },
      {
        // `bun run test:editor`, `bun run test:hot`: hot swap under `moku-game dev`, in Chromium.
        extends: true,
        test: { name: "hot", include: ["tests/hot/**/*.hot.ts"] }
      }
    ]
  }
});
