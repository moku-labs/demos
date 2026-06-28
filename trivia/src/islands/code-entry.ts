/**
 * @file code-entry island — the `/code` (no-code) join-by-code box. Renders {@link CodeEntry}; on submit
 * it hard-navigates to `/code/{code}` so the controller island boots cleanly for that room. Like the
 * controller island it repairs `data-layout` on mount, because the SPA serves the stage layout markup for
 * every route (no SSR) — without the fix the phone's `[data-layout="controller"]` chrome never applies.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland, hardNavigate } from "@moku-labs/web/browser";
import { h } from "preact";
import { CodeEntry } from "../components/CodeEntry";
import { urls } from "../routes";

/** No per-instance state — {@link CodeEntry} owns its own typed-code `useState`. */
type CodeEntryState = Record<string, never>;

/**
 * Seed the (empty) island state.
 *
 * @returns The empty state.
 * @example
 * ```ts
 * createIsland("code-entry", { state: initState });
 * ```
 */
function initState(): CodeEntryState {
  return {};
}

/**
 * Repair `data-layout` → `"controller"` on mount (the SPA serves the stage layout for all routes; the
 * same fix the controller island applies), so the phone gradient + safe-area chrome apply on `/code`.
 *
 * @param ctx - The island context (provides `el`).
 * @example
 * ```ts
 * createIsland("code-entry", { onMount: fixLayout });
 * ```
 */
function fixLayout(ctx: Spa.IslandContext<CodeEntryState>): void {
  const layoutElement = ctx.el.closest<HTMLElement>("[data-layout]");
  if (layoutElement && layoutElement.dataset.layout !== "controller") {
    layoutElement.dataset.layout = "controller";
  }
}

/**
 * Render the join-by-code box, navigating to the controller deep-link on submit.
 *
 * @returns The code-entry box.
 * @example
 * ```ts
 * createIsland("code-entry", { render });
 * ```
 */
function render(): Spa.RenderResult {
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline navigate adapter (full load boots the controller)
  return h(CodeEntry, { onJoin: code => hardNavigate(urls.toUrl("controller", { code })) });
}

/** `/code` join-by-code entry island (repairs the phone layout, navigates to `/code/{code}` on submit). */
export const codeEntryIsland = createIsland<CodeEntryState>("code-entry", {
  state: initState,
  onMount: fixLayout,
  render
});
