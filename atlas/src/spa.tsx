/**
 * @file Web client — browser bundle entry. Boots the SPA over the shared route table + island
 * registry. The stylesheet (`src/styles/main.css`) is collected by the framework `build` plugin's
 * bundle phase into a content-hashed `assets/main-*.css` and injected as a `<link>` — it is NOT
 * imported here (importing it into the JS entry makes the bundler emit it as a module script).
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "./config";
import { islands } from "./islands";
import { installViewTransitionGuard } from "./lib/view-transitions";
import { routes } from "./routes";

// Arm the guard before anything can navigate: it swallows the benign `AbortError: Transition was
// skipped` the View Transitions API raises when a crossfade is superseded by the next navigation.
installViewTransitionGuard();

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

// Module-level `navigate(...)` (the chrome/nav helpers) and `hardNavigate(...)` (the auth↔app boundary
// crossing — a real full-page load that steps the SPA interceptor aside) are provided directly by
// `@moku-labs/web/browser`: they bind to this booted app automatically, so no registration is needed.
// Islands with a ctx use `ctx.navigate(...)`.
