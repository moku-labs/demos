/**
 * @file Web client browser entry — boots the SPA over the route table + island registry, then boots the
 * room role by URL (`/` → stage, `/controller/:code` → controller). The stylesheet (`styles/main.css`)
 * is collected by the build plugin and injected as a `<link>` — it is NOT imported here.
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { startController, startStage } from "./lib/room";
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

/** The deep-link prefix that selects the phone-controller role. */
const CONTROLLER_PREFIX = "/controller/";
const path = globalThis.location.pathname;

if (path.startsWith(CONTROLLER_PREFIX)) {
  await startController(path.slice(CONTROLLER_PREFIX.length));
} else {
  await startStage();
}
