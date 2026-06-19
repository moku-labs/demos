/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/cli scripts.
 */
import {
  buildPlugin,
  cliPlugin,
  contentPlugin,
  createApp,
  dataPlugin,
  deployPlugin,
  fileSystemContent
} from "@moku-labs/web";
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
    // Dependency order: data → content → build → deploy → cli (each depends on the prior).
    plugins: [dataPlugin, contentPlugin, buildPlugin, deployPlugin, cliPlugin],
    pluginConfigs: {
      site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
      router: { routes },
      spa: { components: islands },
      // buildPlugin requires contentPlugin, which requires ≥1 provider. Tracker has no markdown
      // content (the board is live worker data), so this points at an empty `content/` dir.
      content: { providers: [fileSystemContent({ contentDir: "content" })] },
      // cli has its own outDir (default "dist") used by serve/preview + the post-build 404 check —
      // align it with build.outDir so they all target the dir wrangler serves as ASSETS.
      cli: { outDir: "dist/client" },
      // Client build → dist/client (served by the worker's ASSETS binding; see wrangler.jsonc).
      // SPA demo: board data is fetched live from the worker, so RSS/sitemap/OG/image passes are off.
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
 * await app.start();
 * await app.cli.build();
 * ```
 */
export const app = makeApp("production");
