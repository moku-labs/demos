/**
 * @file One command through the editor drives the game: the tools page runs `game.tap` on Play,
 * the hub hands it to the agent, the game leaves Home and the Board arrives.
 */
import { afterEach, describe, expect, it } from "vitest";
import { paramsOf, shutdown, startStack } from "./helpers/stack";

/** Three cores and a real game start for the test. */
const TIMEOUT_MS = 30_000;

afterEach(shutdown);

describe("a command through the editor", () => {
  it(
    "game.tap on Play walks the game from Home onto the Board",
    async () => {
      const { tools, game, server } = await startStack();
      const { link } = tools.app;
      expect(game.app.flow.state().path).toBe("home");
      expect(game.session().screen).toBe("home");

      // The key of the button, the way a tap of the player finds it on the screen.
      const ran = await link.run("game.tap", { key: "homePlay" });

      expect(ran.value).toBe(true);
      // Home leaves on stepped frames, then the round starts with the human to move.
      await game.walkTo("round/humanTurn");
      expect(game.session()).toMatchObject({ screen: "board", turn: 1, result: "none" });
      expect(await link.read("game.position")).toMatchObject({
        path: "round/humanTurn",
        waiting: ["tap", "home"]
      });
      // The command went over the wire: the hub handed this run to the agent.
      expect(server.tap.sent("agent", "run").map(message => paramsOf(message))).toContainEqual({
        id: "game.tap",
        input: { key: "homePlay" }
      });
    },
    TIMEOUT_MS
  );
});
