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
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/types.ts",
        "src/**/types/**",
        "src/**/__tests__/**",
        "src/**/*.tsx",
        // Browser/room/worker-only orchestration glue — exercised via the integration + e2e gates,
        // not unit tests (same rationale as the .tsx DOM glue above). The PURE bridge core
        // (`lib/room/snapshot.ts`) and the pure `lib/*` helpers stay in coverage.
        "src/lib/room/index.ts",
        "src/lib/room/stage.ts",
        "src/lib/room/controller.ts",
        "src/lib/room/observer.ts",
        "src/islands/**",
        "src/app.ts",
        "src/server.ts",
        "src/cloudflare/**"
      ],
      reporter: ["text", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }
    }
  }
});
