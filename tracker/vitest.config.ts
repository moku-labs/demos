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
      // Excluded: type-only modules; test dirs; island DOM glue (browser-only, exercised by the
      // bundle-safety + manual/e2e path, not unit-coverable without a full DOM + bundler — the
      // .tsx components/pages/layouts are already outside the `*.ts` include for the same reason).
      exclude: [
        "src/**/types.ts",
        "src/**/types/**",
        "src/**/__tests__/**",
        "src/islands/**",
        "src/**/*.tsx"
      ],
      reporter: ["text", "lcov"],
      // lines/functions/statements gate at 90% (achieved ≈97%). Branches gate lower because the
      // residual uncovered branches are type-defensive `?? ""` coalescings on router params (typed
      // `string | undefined` by @moku-labs/worker, but a matched route always supplies them) — the
      // `undefined` side is unreachable through the real router, so it cannot be covered by a test.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 }
    }
  }
});
