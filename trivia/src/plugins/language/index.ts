/**
 * @file language — Standard room game plugin (host/stage role).
 *
 * Tallies per-peer EN/RU votes over a configurable confirm window, then resolves the match
 * language once (majority; `defaultLang` on tie/zero) and invokes the caller's `onConfirm`
 * callback exactly once. Owns the `language-vote` intent and the `languageVote` synced slice.
 *
 * - **Slice:** `languageVote` (`{ open, options, deadlineTs, leading, confirmed }`)
 * - **Intent:** `language-vote` (registered + handled via intentPlugin)
 * - **API:** `openVote(onConfirm)` / `cancelVote()` / `result()`
 * - **Timer:** handle lives in `vote-timer.ts` module closure; `onStop` clears it.
 *   `onStop` receives only `ctx.global` (TeardownContext) so module closure is the only viable location.
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { DEFAULT_CONFIG } from "./config";
import { createLanguageApi, initLanguagePlugin } from "./handlers";
import { stopLanguage } from "./lifecycle";
import { createLanguageState } from "./state";

/** Module-scoped open-gate: `true` while the vote window is live. */
let _voteOpen = false;

/**
 * Language-vote plugin — Standard tier.
 *
 * Drives the match-start group language selection. `match-flow` depends on this plugin and calls
 * `app.language.openVote(cb)` to open the timed window; the winning language (majority or
 * `defaultLang`) is passed to `cb` exactly once when the window expires.
 *
 * @example
 * ```ts
 * import { createApp, stagePlugin } from "@moku-labs/room";
 * import { languagePlugin } from "./plugins/language";
 *
 * const app = createApp({ plugins: [stagePlugin, languagePlugin] });
 * app.language.openVote(lang => matchFlow.advance(lang));
 * ```
 */
export const languagePlugin = createPlugin("language", {
  depends: [stagePlugin, syncPlugin, intentPlugin],
  config: DEFAULT_CONFIG,
  createState: createLanguageState,
  /**
   * Register the `languageVote` slice + the `language-vote` intent on init.
   *
   * @param ctx - The plugin context (provides `require` to reach the engine plugins).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during the onInit phase.
   * ```
   */
  onInit: ctx => {
    initLanguagePlugin(
      ctx.require(syncPlugin),
      ctx.require(intentPlugin),
      ctx.require(stagePlugin),
      ctx.config,
      ctx.state,
      () => _voteOpen
    );
  },
  /**
   * Build the public language-vote API (`openVote` / `cancelVote` / `result`).
   *
   * @param ctx - The plugin context (provides `require`, `config`, `state`).
   * @returns The language plugin API.
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during app assembly.
   * ```
   */
  api: ctx =>
    createLanguageApi(
      ctx.require(stagePlugin),
      ctx.config,
      ctx.state,
      () => _voteOpen,
      v => {
        _voteOpen = v;
      }
    ),
  // @no-resource-check — onStop clears the pending vote-window setTimeout (spec/03 §Lifecycle)
  onStop: stopLanguage
});
