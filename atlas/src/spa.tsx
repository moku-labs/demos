/**
 * @file Web client — browser bundle entry. Boots the SPA over the shared route table + island
 * registry. The stylesheet (`src/styles/main.css`) is collected by the framework `build` plugin's
 * bundle phase into a content-hashed `assets/main-*.css` and injected as a `<link>` — it is NOT
 * imported here (importing it into the JS entry makes the bundler emit it as a module script).
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { registerHardNavigate } from "./lib/hard-nav";
import { registerNavigator } from "./lib/nav";
import { routes } from "./routes";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    // viewTransitions: the SPA wraps each region swap in document.startViewTransition, so navigation
    // crossfades the working area (board↔board, board↔issue, board↔list) instead of hard-cutting and
    // re-running per-mount animations. It is a visual-diff transition — a same-board nav (open/close an
    // issue) reads as seamless, a real board/department change reads as a calm crossfade. The framework
    // disables it under prefers-reduced-motion and on browsers without the API (graceful raw swap). The
    // overlay routes (issue / attachment) declare `.scroll("preserve")` so opening one never moves the
    // board behind the scrim (replacing the old position:fixed freeze).
    spa: { islands, viewTransitions: "crossfade" }
  }
});

await app.start();

// Module-level navigation (the chrome/nav helpers in lib/nav.ts, called outside an island ctx) routes
// through app.spa.navigate — the same swap pipeline as a link click, no synthesised anchor. Islands
// with a ctx use `ctx.navigate(...)` directly.
registerNavigator((path, options) => app.spa.navigate(path, options));

// The SPA swaps only `main > section`, so it cannot turn the app chrome into the auth split (or
// back). Crossing that boundary (sign-in / sign-out / a 401) needs a TRUE full-page load — but the
// Navigation-API interceptor catches even `location.assign`. Stopping the app first removes that
// interceptor (spa kernel `dispose`), so the subsequent assign is a real document load. See hard-nav.ts.
registerHardNavigate(async url => {
  await app.stop();
  globalThis.location.assign(url);
});
