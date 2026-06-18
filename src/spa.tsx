/**
 * @file Web client — browser bundle entry; boots the SPA over the shared route table + islands.
 */
import { createApp } from "@moku-labs/web/browser";
import { islands } from "./islands";
import { routes } from "./routes";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: { router: { routes }, spa: { components: islands } }
});

await app.start();
