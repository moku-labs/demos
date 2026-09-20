import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "src/plugins/**/__tests__/unit/**/*.test.ts"]
        }
      },
      {
        test: {
          name: "integration",
          include: [
            "tests/integration/**/*.test.ts",
            "src/plugins/**/__tests__/integration/**/*.test.ts"
          ]
        }
      }
    ],
    coverage: {
      provider: "istanbul",
      // The pure domain is where the threshold earns its keep: `src/lib` holds every todo
      // operation and every capability call. Composition roots (`index.ts`, `spa.tsx`,
      // `native.ts`), the island and the components are covered by the integration suite and
      // verified in the real shells, not by a line counter.
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/types.ts", "src/**/types/**", "src/**/__tests__/**", "src/**/*.tsx"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }
    }
  }
});
