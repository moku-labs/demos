/**
 * @file Web client browser entry — boots the SPA over the route table + island registry. The role is
 * selected by the matched route, not by parsing the URL here: `/` mounts the `stage` island (which boots
 * the host in its `onMount`), `/code/{code}` mounts the `controller` island (which reads `ctx.params.code`
 * and joins in its `onMount`), and `/code` (no code) mounts the `code-entry` island (a join-by-code box).
 * The lobby QR encodes the `/code/{code}` deep-link directly (built app-side in `lib/room`), so there is
 * no `?room=` normalization step here. The stylesheet (`styles/main.css`) is collected by the build
 * plugin and injected as a `<link>` — it is NOT imported here.
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
    spa: { islands, swapSelector: "[data-layout]" }
  }
});

await app.start();
