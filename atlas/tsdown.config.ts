import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts"
  },
  format: ["esm", "cjs"],
  // Private consumer app — no declaration emit. The inferred `createApp` type references
  // unexported @moku-labs/web internals (TS4023), and an app is never consumed as a library.
  dts: false,
  clean: true,
  sourcemap: false,
  tsconfig: "tsconfig.build.json"
});
