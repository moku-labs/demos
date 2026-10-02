/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/dev scripts.
 */
import { buildPlugin, cliPlugin, createApp, deployPlugin } from "@moku-labs/web";
import { islands } from "./islands";
import { routes } from "./routes";
import { SITE } from "./site";

/**
 * The web client app — consumed by `scripts/build.ts` (`app.cli.build()`) and `scripts/dev.ts`
 * (`app.cli.serve()`). Offline app: no worker, no deploy, no feeds/sitemap/OG passes.
 *
 * @example
 * ```ts
 * await app.cli.build();
 * ```
 */
export const app = createApp({
  config: { stage: "production", mode: "spa" },
  // `cliPlugin` depends on `deployPlugin` (framework rule) — it is composed but never invoked.
  plugins: [buildPlugin, deployPlugin, cliPlugin],
  pluginConfigs: {
    site: SITE,
    router: { routes },
    // The one island host is the whole page, so the layout wrapper is the SPA swap region.
    spa: { islands, swapSelector: "[data-layout]" },
    // `port` is the dev-server port; `src/native.ts` points the native shell's `devUrl` at it.
    // `watchDirs` drops the framework default `content` — this app has no content directory,
    // and `fs.watch` on a missing one aborts `serve()`.
    cli: { outDir: "dist", port: 4173, watchDirs: ["src"] },
    build: {
      outDir: "dist",
      clientEntry: "src/spa.tsx",
      template: "src/index.html",
      minify: true,
      feeds: false,
      sitemap: false,
      images: false,
      ogImage: false
    }
  }
});
