/**
 * @file Web client — browser bundle entry. Boots the SPA over the shared route table + island
 * registry, and imports the stylesheet so the build's client-entry module graph reaches the CSS
 * (the framework bundles it into a content-hashed `assets/*.css`).
 */
import "./styles/index.css";
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes } from "./routes";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    spa: { components: islands }
  }
});

await app.start();
