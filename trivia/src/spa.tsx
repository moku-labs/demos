/**
 * @file Web client browser entry — boots the SPA over the route table + island registry. The role is
 * selected by the matched route, not by parsing the URL here: `/` mounts the `stage` island (which boots
 * the host in its `onMount`), `/controller/{code}` mounts the `controller` island (which reads
 * `ctx.params.code` and joins in its `onMount`). The stylesheet (`styles/main.css`) is collected by the
 * build plugin and injected as a `<link>` — it is NOT imported here.
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { routes, urls } from "./routes";

// The room framework encodes the phone join URL in its fixed `${origin}/?room=CODE` form (room's
// `buildJoinUrl`), which matches our `/` = TV route. Normalize that scanned deep-link into our
// `/controller/{code}` route BEFORE the SPA matches, so a scanned QR boots the phone controller —
// not a second TV. Only the TV-root carrying `?room=` is rewritten; real controller links are untouched.
const room = new URLSearchParams(globalThis.location.search).get("room");
if (room && globalThis.location.pathname === "/") {
  globalThis.history.replaceState(null, "", urls.toUrl("controller", { code: room }));
}

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    spa: { islands, swapSelector: "[data-layout]" }
  }
});

await app.start();
