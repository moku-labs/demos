/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/dev scripts.
 */
import {
  buildPlugin,
  cliPlugin,
  collectionPlugin,
  createApp,
  dataPlugin,
  deployPlugin
} from "@moku-labs/web";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes } from "./routes";

// The E2E suite builds with `TRIVIA_E2E=1` (set by the Playwright webServer), which swaps in a
// test-only client entry able to render deterministic fixture phase screens (tests/e2e/harness). The
// production build/deploy never sets it, so `src/spa.tsx` is the entry and NO fixture/harness code is
// ever bundled into the shipped client.
const clientEntry = process.env.TRIVIA_E2E === "1" ? "tests/e2e/harness/spa-e2e.ts" : "src/spa.tsx";

/**
 * The production web client app — consumed by `scripts/build.ts` (`app.cli.build()` + the post-build
 * `app.collection.write(...)` bank emit) and the `dev` cli passthrough. The whole composition is a
 * directly-visible `createApp` literal, so a reader sees the full plugin set + config at a glance. The
 * question bank is build-authored JSON served as static shards (the `collection` provider), so the
 * RSS/sitemap/OG/image passes are off.
 *
 * @example
 * ```ts
 * await app.cli.build();
 * await app.collection.write(bankShards, { outDir: "dist/client" });
 * ```
 */
export const app = createApp({
  config: { stage: "production", mode: "spa" },
  // Dependency order: data → collection → build → deploy → cli. The bank ships as build-authored JSON
  // shards via the `collection` provider (emitted in scripts/build.ts), not Markdown, so no content
  // plugin is composed (web ≥ 1.15.0 no longer requires content for build).
  plugins: [dataPlugin, collectionPlugin, buildPlugin, deployPlugin, cliPlugin],
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    // swapSelector: both routes use a [data-layout] wrapper as the SPA swap region (stage + controller
    // layouts differ entirely; the default "main > section" doesn't match either layout's structure).
    spa: { islands, swapSelector: "[data-layout]" },
    // The question bank is a `collection` of build-authored JSON shards emitted to dist/client/bank/**
    // (served as static ASSETS); the room question-bank plugin fetches them via the same `/` baseUrl.
    collection: { baseUrl: "/" },
    // cli's outDir (serve/preview + the post-build 404 check) is aligned with build.outDir so they all
    // target the dir the worker serves as ASSETS.
    cli: { outDir: "dist/client" },
    // Client build → dist/client (served by the worker's ASSETS binding). SPA game: no feeds/sitemap/OG.
    build: {
      outDir: "dist/client",
      clientEntry,
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
