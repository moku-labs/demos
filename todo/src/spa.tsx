/**
 * @file Web client browser entry — boots the SPA over the route table + island registry. The same
 * bundle runs in a browser tab and inside the Tauri shell: the `todo-app` island starts the system
 * app on mount, and `@moku-labs/system` selects the provider from there. Nothing node-only and
 * nothing from `@moku-labs/native` is reachable from this graph. The stylesheet (`styles/main.css`)
 * is collected by the build plugin and injected as a `<link>` — it is NOT imported here.
 */
import { createApp } from "@moku-labs/web/browser";
import { islands } from "./islands";
import { routes } from "./routes";
import { SITE } from "./site";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: SITE,
    router: { routes },
    spa: { islands, swapSelector: "[data-layout]" }
  }
});

await app.start();
