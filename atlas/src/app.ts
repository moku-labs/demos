/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/cli scripts.
 */
import { buildPlugin, cliPlugin, createApp, dataPlugin, deployPlugin } from "@moku-labs/web";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes } from "./routes";

/**
 * The production web client app — consumed by `scripts/build.ts` (`app.cli.build()`) and the
 * `dev`/`deploy` cli passthroughs (all import this `app`). The whole composition is a directly-visible
 * `createApp` literal, so a reader sees the full plugin set + config at a glance.
 *
 * @example
 * ```ts
 * await app.cli.build();
 * ```
 */
export const app = createApp({
  config: { stage: "production", mode: "spa" },
  // Dependency order: data → build → deploy → cli. The board is live worker data, not Markdown,
  // so no content plugin is composed (web ≥ 1.15.0 no longer requires content for build).
  plugins: [dataPlugin, buildPlugin, deployPlugin, cliPlugin],
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    spa: { islands },
    // cli's outDir (serve/preview + the post-build 404 check) is aligned with build.outDir so they
    // all target the dir wrangler serves as ASSETS.
    cli: { outDir: "dist/client" },
    // Client build → dist/client (served by the worker's ASSETS binding). SPA demo: board data is
    // fetched live from the worker, so the RSS/sitemap/OG/image passes are off.
    build: {
      outDir: "dist/client",
      clientEntry: "src/spa.tsx",
      template: "src/index.html",
      notFound: { path: "src/404.html" },
      minify: true,
      feeds: false,
      sitemap: false,
      images: false,
      ogImage: false
    }
  }
});
