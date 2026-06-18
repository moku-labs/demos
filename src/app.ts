/**
 * @file Web client — Node build composition (`mode: "spa"`); consumed by the build/cli scripts.
 */
import { buildPlugin, cliPlugin, createApp } from "@moku-labs/web";
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
    plugins: [buildPlugin, cliPlugin],
    pluginConfigs: {
      site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
      router: { routes },
      spa: { components: islands }
    }
  });
}

/** The production web client app instance. */
export const app = makeApp("production");
