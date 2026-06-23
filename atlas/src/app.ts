/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/cli scripts.
 */
import { buildPlugin, cliPlugin, createApp, dataPlugin, deployPlugin } from "@moku-labs/web";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes } from "./routes";

/**
 * Builds the web client app for a given deploy stage.
 *
 * @param stage - The deployment stage.
 * @returns The composed `@moku-labs/web` app.
 * @example
 * ```ts
 * const app = makeApp("production");
 * await app.cli.build();
 * ```
 */
export function makeApp(stage: "production" | "development" | "test") {
  return createApp({
    config: { stage, mode: "spa" },
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
}

/**
 * The production web client app instance — consumed by `scripts/build.ts` (`app.cli.build()`) and the
 * `dev`/`deploy` cli passthroughs. Use {@link makeApp} directly to compose a different stage.
 *
 * @example
 * ```ts
 * await app.cli.build();
 * ```
 */
export const app = makeApp("production");
