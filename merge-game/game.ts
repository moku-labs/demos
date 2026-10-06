/**
 * @file The one entry of the merge game: the root flow, then the composition root, two
 * `createApp` calls, one without the screen and one with it. Features come from the `@features`
 * barrel, plugins from `@plugins`, the shared layer from `@shared`. A shipped game adds
 * `onStart: ctx => { ctx.flow.run().catch(showFatal); }`; here the headless runner owns `run()`,
 * so a fatal error reaches the test instead of a handler.
 */
import type { Assets, Audio, I18n, Model, PlatformProvider, Renderer } from "@moku-labs/game";
import {
  audioPlugin,
  createApp,
  effectsPlugin,
  platformPlugin,
  screen,
  slot
} from "@moku-labs/game";
import { fakeClock, memory } from "@moku-labs/game/testing";
import { defineFlow } from "@core/kit";
import type { Player } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import {
  boardFlow,
  boardFeature,
  boot,
  dailyGift,
  energyFeature,
  giftFeature,
  home,
  homeFeature,
  hudFeature,
  leaveFeature,
  leaveGame,
  loadFailed,
  ordersFeature,
  retryLoading,
  rewardFeature,
  setLoading,
  settingsFeature,
  settingsFlow,
  splash,
  splashFeature
} from "@features";
import { exitPlugin, loadingPlugin, localePlugin, uiSoundsPlugin } from "@plugins";
import { sharedFeature } from "@shared";

/**
 * The main flow: boot, the splash that waits for the bundles and offers a retry when one of them
 * fails, the home checkpoint with its three buttons, the board as a node, and the slot every
 * finished order passes through. The settings sub-flow hangs off Home as it hangs off the board,
 * because the gear is on both screens; the daily gift is a popup of Home, and so is the Leave popup
 * that Back on Home asks first with. Each step is a feature's own flow or node, taken from the
 * `@features` barrel; it lives here, so `core/` never imports a feature.
 */
export const mainFlow = defineFlow("main", {
  nodes: {
    boot,
    splash,
    setLoading,
    loadFailed,
    retryLoading,
    home,
    dailyGift,
    leaveGame,
    settings: settingsFlow,
    board: boardFlow,
    afterOrder: slot("afterOrder")
  },
  start: "boot",
  edges: {
    boot: { ready: "splash" },
    splash: {
      progress: "setLoading",
      loaded: "home",
      failed: "loadFailed",
      retry: "retryLoading"
    },
    setLoading: { done: "splash" },
    loadFailed: { done: "splash" },
    retryLoading: { done: "splash" },
    home: {
      play: "board",
      gift: "dailyGift",
      openSettings: "settings",
      back: "leaveGame"
    },
    dailyGift: { claim: "home", close: "home" },
    leaveGame: { leave: "home", stay: "home" },
    settings: { closed: "home" },
    board: { orderComplete: "afterOrder", left: "home" },
    // Back onto the board: the reward is taken there, the coins fly onto the HUD counter, and the
    // player keeps playing. "home" is reached by leaving the board.
    afterOrder: { done: "board" }
  }
});

/**
 * Reads the volumes the player chose out of the committed save. `audio` calls it on every commit,
 * which is why no node ever touches a gain.
 *
 * @param player - The committed player tree, as plain JSON.
 * @returns The gain of every bus.
 * @example
 * ```ts
 * volumesOf(startingPlayer as unknown as Model.Json); // { master: 1, music: 0.6, sfx: 1 }
 * ```
 */
export function volumesOf(player: Model.Json): Player["settings"]["audio"] {
  return (player as unknown as Player).settings.audio;
}

/**
 * The locales a dev build adds: the pseudo-locale `en-XA` of `--pseudo`, so `ui.lint` measures
 * the longest text and an untranslated literal shows up unaccented. A production build defines
 * `__MOKU_GAME_DEV__` as `false`, the condition folds and the module is never imported.
 *
 * @returns `en-XA` in a dev build, nothing otherwise.
 */
export function devLocales(): Record<string, I18n.StringsLoader> {
  if (typeof __MOKU_GAME_DEV__ === "undefined" || !__MOKU_GAME_DEV__) return {};

  return { "en-XA": () => import("@generated/strings.en-XA") };
}

/** The save seam, recording every call it gets. */
export type Provider = ReturnType<typeof memory>;

/** The time source the test steers. */
export type Clock = ReturnType<typeof fakeClock>;

/** What a test may pin when it creates the game. */
export type GameOptions = {
  /** The save seam. A fresh in-memory provider by default: a new player. */
  provider?: Provider;
  /** The time source. A fake clock at `startMoment` by default. */
  clock?: Clock;
  /** The rng seed. Fixed, so two runs of one route draw the same items. */
  seed?: number;
  /** The player a new save starts from. */
  player?: Player;
};

/** The game and the two seams a test holds on to. */
export type Game = {
  app: ReturnType<typeof createApp>;
  clock: Clock;
  provider: Provider;
};

/** Where the fake clock starts. Not zero, so a stored moment of zero is really in the past. */
export const startMoment = 1_000_000;

/**
 * Creates the game.
 *
 * @param options - The seams a test pins: provider, clock, seed and starting player.
 * @returns The app and the seams behind it.
 * @example
 * ```ts
 * const { app, clock } = createGame({ seed: 42 });
 * ```
 */
export function createGame(options: GameOptions = {}): Game {
  const provider = options.provider ?? memory();
  const clock = options.clock ?? fakeClock(startMoment);
  const app = createApp({
    plugins: [rewardFeature.logicOnly],
    config: { referenceLong: 2100 },
    pluginConfigs: {
      model: {
        playerProvider: provider,
        initialPlayer: options.player ?? startingPlayer,
        initialSession: startingSession,
        seed: options.seed ?? 42
      },
      clock: { source: clock },
      flow: { mainFlow, safeNode: "home" }
    }
  });

  return { app, clock, provider };
}

/**
 * The plugins of the game with its screen: the nine screen plugins, `audio`, `effects` and
 * `platform`, which are opt-in and `platform` last of them, the shared layer (the feature
 * `shared`), every feature — the splash, Home, the board, the reward, the HUD, the orders, the
 * settings, the energy, the daily gift and the Leave popup — and the four plugins of `plugins/`:
 * the language switch (`locale`), the way out of the Leave popup (`exit`), the loading of the
 * splash (`loading`) and the click of every control (`uiSounds`). The look of the board under the
 * pointer is a system of the board feature. Without a provider `platform` is inert; the web page and the native app pass the
 * bridge of `platform-bridge.ts`.
 */
export const screenPlugins = [
  ...screen,
  audioPlugin,
  effectsPlugin,
  platformPlugin,
  rewardFeature,
  splashFeature,
  homeFeature,
  boardFeature,
  sharedFeature,
  hudFeature,
  ordersFeature,
  settingsFeature,
  energyFeature,
  giftFeature,
  leaveFeature,
  localePlugin,
  exitPlugin,
  loadingPlugin,
  uiSoundsPlugin
];

/** The game with its screen and the two seams a test holds on to. */
export type ScreenGame = {
  app: ReturnType<typeof createApp<typeof screenPlugins>>;
  clock: Clock;
  provider: Provider;
};

/** What a test may pin when it creates the game with its screen. */
export type ScreenGameOptions = GameOptions & {
  /** The manifest the assets plugin reads. A URL in the browser, the parsed file in a test. */
  manifest?: string | Assets.Manifest;
  /**
   * The file seam of the assets plugin. Left out, the game is headless: the manifest is read and
   * every bundle counts as loaded at once. A test passes one to watch the splash really load.
   */
  io?: Assets.AssetsIo;
  /**
   * The audio seams: the context, and how many started sounds the journal keeps. Left out, the
   * runtime's own `AudioContext` is used, none in a test, and the journal is off. A test passes a
   * fake context to hear the game.
   */
  audio?: { context: () => Audio.AudioContextLike; journal: number };
  /**
   * The renderer seams: the element the canvas goes into and how Pixi is loaded. Left out, the
   * renderer is inert and nothing is drawn. A test passes a fake page and a fake Pixi module to
   * draw the game, its particles and its filters.
   */
  renderer?: { mount: string; loadPixi: () => Promise<Renderer.PixiModule> };
  /**
   * The phone behind the game: its Back button, its pause and its `exit()`. Left out, `platform`
   * is inert and Leave closes nothing. A test passes a fake to press Back.
   */
  platform?: PlatformProvider;
};

/**
 * Creates the same game with its screen composed: the screen set, `audio`, `effects`, `platform`
 * and the view half of every feature. Without the renderer seam the renderer is inert, the audio context stays
 * locked, the effects draw nothing and the assets plugin reads the manifest only, so this runs in
 * plain Bun exactly like the headless game.
 *
 * @param options - The seams a test pins, plus the manifest.
 * @returns The app and the seams behind it.
 * @example
 * ```ts
 * const { app } = createScreenGame({ seed: 42 });
 * await app.start();
 * app.flow.run(); // boot, the splash takes "progress" and "loaded" from the loading plugin
 * app.flow.state().path; // "home" a few microtasks later, with the Home scene mounted
 * ```
 */
export function createScreenGame(options: ScreenGameOptions = {}): ScreenGame {
  const provider = options.provider ?? memory();
  const clock = options.clock ?? fakeClock(startMoment);
  const app = createApp({
    plugins: [...screenPlugins],
    // The board column is 2084 units tall: a wide screen scales the whole interface down together.
    config: { referenceLong: 2100 },
    pluginConfigs: {
      model: {
        playerProvider: provider,
        initialPlayer: options.player ?? startingPlayer,
        initialSession: startingSession,
        seed: options.seed ?? 42
      },
      clock: { source: clock },
      flow: { mainFlow, safeNode: "home" },
      platform: { provider: options.platform },
      exit: { exit: () => options.platform?.exit() },
      loading: {
        bundles: ["home", "board", "orders"],
        retry: { node: "splash", outcome: "retry" }
      },
      uiSounds: { click: "ui.click" },
      renderer: options.renderer ?? {},
      assets: { manifest: options.manifest, io: options.io },
      text: { fonts: { body: "ui.font-body", digits: "ui.font-display" } },
      i18n: { locale: "ru", fallback: "ru", locales: devLocales() },
      audio: { volumes: volumesOf, ...options.audio },
      input: { heldScale: 1.08 },
      // The keyboard focus ring of design §4: a dashed ink ring over a cream halo, 9 px of the
      // 390-wide design outside the control.
      ui: {
        focusRing: {
          stroke: 0x3a_22_12,
          strokeWidth: 4,
          dash: 10,
          offset: 25,
          halo: 0xff_f3_d6,
          haloWidth: 12
        },
        // The name field of the Rename popup: a steady ink caret and a honey selection.
        textInput: {
          caretWidth: 3,
          caret: 0x3a_22_12,
          selection: 0xf2_b4_3d,
          selectionAlpha: 0.45,
          composingUnderline: 3,
          keyboardMargin: 16
        }
      }
    }
  });

  return { app, clock, provider };
}
