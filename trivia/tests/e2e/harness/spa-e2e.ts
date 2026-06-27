/**
 * @file E2E SPA client entry (test-only). Mirrors `src/spa.tsx`, but when the URL carries
 * `?e2ephase=…` it mounts the FIXTURE island registry ({@link ./islands}) — deterministic phase
 * screens with no room boot — instead of the real one. With no param it boots the real app verbatim,
 * so the live two-context WebRTC tests still exercise the genuine stage/controller surfaces.
 *
 * This is the client entry ONLY when `TRIVIA_E2E=1` (the Playwright webServer sets it; see
 * `src/app.ts`). The production build/deploy always uses `src/spa.tsx`, so nothing here — nor any
 * fixture/harness code it imports — is ever part of the shipped bundle.
 */
import { createApp } from "@moku-labs/web/browser";
import { SITE } from "../../../src/config";
import { islands as realIslands } from "../../../src/islands";
import { routes, urls } from "../../../src/routes";
import { fixtureIslands } from "./islands";

const fixtureMode = new URLSearchParams(globalThis.location.search).has("e2ephase");

// Mirror the ?room= normalization from src/spa.tsx so the routing regression tests
// work correctly against the harness server.
const room = new URLSearchParams(globalThis.location.search).get("room");
if (room && globalThis.location.pathname === "/") {
  globalThis.history.replaceState(null, "", urls.toUrl("controller", { code: room }));
}

// Marker a spec can assert so it fails fast with a clear message if a non-harness dev server was reused
// (a plain `bun run dev` without TRIVIA_E2E=1 serves src/spa.tsx, which has no fixture screens).
document.documentElement.dataset.e2eHarness = fixtureMode ? "fixtures" : "live";

const app = createApp({
  config: { mode: "spa" },
  pluginConfigs: {
    site: { name: SITE.name, url: SITE.url, author: SITE.author, description: SITE.description },
    router: { routes },
    spa: { islands: fixtureMode ? fixtureIslands : realIslands, swapSelector: "[data-layout]" }
  }
});

await app.start();
