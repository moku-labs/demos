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
  // The engine and the demo share one Pixi, one core and one common: two copies break.
  resolve: { alias: layerAlias, dedupe: ["pixi.js", "@moku-labs/core", "@moku-labs/common"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "shared/**/__tests__/**/*.test.{ts,tsx}",
            "features/**/__tests__/**/*.test.{ts,tsx}",
            "plugins/**/__tests__/**/*.test.{ts,tsx}"
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
      },
      {
        extends: true,
        test: { name: "hot", include: ["tests/hot/**/*.hot.ts"] }
      }
    ]
  }
});
