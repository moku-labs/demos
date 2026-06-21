/**
 * @file Web client — browser bundle entry. Boots the SPA over the shared route table + island
 * registry. The stylesheet (`src/styles/main.css`) is collected by the framework `build` plugin's
 * bundle phase into a content-hashed `assets/main-*.css` and injected as a `<link>` — it is NOT
 * imported here (importing it into the JS entry makes the bundler emit it as a module script).
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes } from "./routes";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    spa: { islands }
  }
});

await app.start();
