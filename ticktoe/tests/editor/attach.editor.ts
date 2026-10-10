/**
 * @file The editor attaches to the game: the three cores of `@moku-labs/editor` over the real
 * wire, on the whole game at Home. The tools page gets a live link, one session and the manifest
 * of the game with every door of the engine.
 */
import type { Manifest } from "@moku-labs/editor";
import { afterEach, describe, expect, it } from "vitest";
import { GAME_NAME, shutdown, startStack } from "./helpers/stack";

/** Three cores and a real game start for each test. */
const TIMEOUT_MS = 30_000;

/** The 20 sources of the engine's read door, sorted. */
const GAME_SOURCES = [
  "game.assets",
  "game.at",
  "game.audioMuted",
  "game.cheats",
  "game.diff",
  "game.effects",
  "game.entities",
  "game.explain",
  "game.graph",
  "game.history",
  "game.locate",
  "game.log",
  "game.model",
  "game.position",
  "game.projections",
  "game.render",
  "game.schema",
  "game.sounds",
  "game.tainted",
  "game.ui"
];

/** The 17 commands of the engine's write door, sorted. */
const GAME_COMMANDS = [
  "game.answer",
  "game.bookmark",
  "game.capture",
  "game.debug",
  "game.drag",
  "game.fill",
  "game.key",
  "game.mute",
  "game.pause",
  "game.reducedMotion",
  "game.restore",
  "game.resume",
  "game.step",
  "game.tap",
  "game.timeScale",
  "game.trace",
  "game.walk"
];

/** The commands the agent adds: capture, overlay and reload, sorted. */
const EDITOR_COMMANDS = [
  "editor.capture",
  "editor.overlay",
  "editor.reload",
  "editor.series",
  "editor.seriesStop",
  "editor.sheet"
];

afterEach(shutdown);

/**
 * The ids of a manifest list with a prefix, sorted.
 *
 * @param entries - Sources or commands.
 * @param prefix - `game.` or `editor.`.
 * @returns The ids.
 */
function idsOf(entries: readonly { readonly id: string }[] | undefined, prefix: string): string[] {
  return (entries ?? [])
    .map(entry => entry.id)
    .filter(id => id.startsWith(prefix))
    .toSorted();
}

describe("the editor attaches to the game", () => {
  it(
    "links the tools page to the game at Home: a live link and one embedded session",
    async () => {
      const { tools, game } = await startStack();
      const { link, workspace } = tools.app;

      expect(link.status().kind).toBe("live");
      expect(link.manifest()?.game).toBe(GAME_NAME);
      expect(link.sessions()).toEqual([
        expect.objectContaining({ id: link.session(), game: GAME_NAME, embedded: true })
      ]);
      // The tools page reads the game through the link: where it stands, and what it waits for.
      expect(game.app.flow.state().path).toBe("home");
      expect(await link.read("game.position")).toEqual({
        path: "home",
        flow: "main",
        node: "home",
        waiting: ["setLevel", "play"]
      });
      expect(workspace.active()).toBe("game");
    },
    TIMEOUT_MS
  );

  it(
    "lists the doors of the game: every source installed, the engine's and the editor's commands",
    async () => {
      const { tools } = await startStack();
      const manifest: Manifest | undefined = tools.app.link.manifest();

      expect(idsOf(manifest?.sources, "game.")).toEqual(GAME_SOURCES);
      expect(idsOf(manifest?.commands, "game.")).toEqual(GAME_COMMANDS);
      expect(idsOf(manifest?.commands, "editor.")).toEqual(EDITOR_COMMANDS);
      // A door that throws on this game is listed with `available: false`. The game has a screen,
      // sound and confetti, so `game.ui`, `game.sounds` and `game.effects` all answer.
      expect(manifest?.sources.filter(source => source.available === false)).toEqual([]);
    },
    TIMEOUT_MS
  );
});
