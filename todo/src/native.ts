/**
 * @file Native packager app (Layer 3, `@moku-labs/native`) — Node-only, runs beside the web app.
 * The `scripts/native-*.ts` verbs call its typed `cli`. Nothing here ships inside the app.
 */
import { createApp } from "@moku-labs/native";
import { systemPlugins } from "./system";

/**
 * The native app — wraps the web build in a Tauri shell for macOS and iOS.
 *
 * @example
 * ```ts
 * await native.start();
 * await native.cli.build({ target: "macos" });
 * await native.stop();
 * ```
 */
export const native = createApp({
  config: {
    app: {
      name: "Moku Todo",
      identifier: "dev.moku.todo",
      version: "0.1.0",
      // A real 1024x1024 PNG committed under assets/; regenerate with `bun scripts/make-icon.ts`.
      icon: "assets/icon.png",
      category: "public.app-category.productivity"
    },
    web: {
      build: "bun run build",
      devCommand: "bun run dev",
      // Same port as `pluginConfigs.cli.port` in src/index.ts.
      devUrl: "http://localhost:4173",
      dist: "dist"
    },
    system: systemPlugins,
    capabilities: { "deep-link": { mode: "scheme", scheme: "mokutodo" } },
    targets: ["macos", "ios"]
  }
});
