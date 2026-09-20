/**
 * @file The system app — a second `createApp`, from `@moku-labs/system`, living beside the web app in
 * the same browser bundle. It composes the five capabilities `src/system.ts` declares to the native
 * packager, so the permission surface the shell ships and the API the island calls are the same list.
 * Node-free: the Tauri providers are reached through the framework's lazy imports, never from here.
 */
import { createApp } from "@moku-labs/system";
import { clipboardPlugin } from "@moku-labs/system/clipboard";
import { deepLinkPlugin } from "@moku-labs/system/deep-link";
import { notifyPlugin } from "@moku-labs/system/notify";
import { storePlugin } from "@moku-labs/system/store";
import { trayPlugin } from "@moku-labs/system/tray";

/** Store namespace — the Tauri store filename and the IndexedDB database name. */
const STORE_NAME = "moku-todo";

/** Tray identity, and the deep-link scheme declared in `src/native.ts`. */
const APP_ID = "moku-todo";

/** The URI scheme the app is registered for; `mokutodo://add?title=…` adds a todo. */
const DEEP_LINK_SCHEME = "mokutodo";

/**
 * Compose the system app. Called once per island mount (and once per test), so nothing
 * module-level has to be started, stopped or reset behind the app's back.
 *
 * @returns The composed system app; `start()` selects a provider per capability.
 * @example
 * ```ts
 * const system = createSystemApp();
 * await system.start();
 * ```
 */
export function createSystemApp() {
  return createApp({
    plugins: [storePlugin, notifyPlugin, clipboardPlugin, trayPlugin, deepLinkPlugin],
    pluginConfigs: {
      store: { name: STORE_NAME },
      tray: { id: APP_ID },
      deepLink: { schemes: [DEEP_LINK_SCHEME] }
    }
  });
}

/** The composed system app, as the island and the capability layer see it. */
export type SystemApp = ReturnType<typeof createSystemApp>;
