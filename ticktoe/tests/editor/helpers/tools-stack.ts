/**
 * @file The tools stack of the editor scenarios: the tools page booted from the HTML the real
 * pages route serves, the tools core of `@moku-labs/editor/tools` with the speed configs, and the
 * workspace mounted inside `act`.
 */
import type { ToolsBoot } from "@moku-labs/editor";
import { createApp } from "@moku-labs/editor/tools";
import { act } from "preact/test-utils";
import { currentPage } from "./page";
import type { ServerStack } from "./server-stack";

/** The tools app type. */
export type ToolsApp = ReturnType<typeof createApp>;

/** One running tools app. */
export type ToolsStack = {
  readonly kind: "tools";
  readonly app: ToolsApp;
  /** Stops the tools app. */
  stop(): Promise<void>;
};

/** The id of the boot tag pages injects. */
const BOOT_ID = "moku-editor-boot";

/** The boot tag in a served page. */
const BOOT_TAG = /<script type="application\/json" id="moku-editor-boot">([\s\S]*?)<\/script>/;

/**
 * Fetches the tools page from the real pages route and reads its boot JSON.
 *
 * @param server - The running server.
 * @returns The boot the page carries.
 * @throws {Error} When the page does not answer 200 or carries no boot tag.
 */
async function servedBoot(server: ServerStack): Promise<ToolsBoot> {
  const response = await fetch(`${server.origin}${server.app.hub.path()}/`);
  const html = await response.text();
  const json = BOOT_TAG.exec(html)?.[1];
  if (!response.ok || json === undefined) {
    throw new Error(`the tools page answered ${String(response.status)} without a boot tag`);
  }
  const boot: ToolsBoot = JSON.parse(json);
  return boot;
}

/**
 * Puts the boot tag into the page body, replacing an earlier one.
 *
 * @param boot - The boot.
 */
function putBoot(boot: ToolsBoot): void {
  globalThis.document.querySelector(`#${BOOT_ID}`)?.remove();
  const tag = globalThis.document.createElement("script");
  tag.type = "application/json";
  tag.id = BOOT_ID;
  tag.textContent = JSON.stringify(boot);
  globalThis.document.body.append(tag);
}

/**
 * Boots the tools page: GET `<origin><hub path>/` from the real pages route, puts its boot JSON
 * into the page, creates the tools app with the speed configs (`link.retryMs: 100`,
 * `workspace.reloadTimeoutMs: 3000`, the flowView layout without its worker), starts it and mounts
 * the workspace into `[data-editor-root]` inside `act`.
 *
 * @param server - The running server.
 * @returns The started tools stack.
 * @throws {Error} When no page is installed.
 */
export async function bootTools(server: ServerStack): Promise<ToolsStack> {
  const page = currentPage();
  if (page === undefined) throw new Error("bootTools needs installPage() first");
  putBoot(await servedBoot(server));

  const app = createApp({
    pluginConfigs: {
      link: { retryMs: 100 },
      workspace: { reloadTimeoutMs: 3000 },
      flowView: { layout: { file: ".moku/editor/layout.json", worker: false, saveDelayMs: 400 } }
    }
  });
  app.log.clearSinks();
  await app.start();
  await act(() => {
    app.workspace.mount(page.root);
  });

  return { kind: "tools", app, stop: () => app.stop() };
}
