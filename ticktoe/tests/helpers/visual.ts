/**
 * @file Helpers of the visual tests: the players and complete sessions a test starts from, the
 * frames that let a screen settle, the steps that put a test on the scene `stage`, and the step
 * that shows a finished round at its celebration.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import type { Board } from "@core/types";
import type { VisualStart, VisualStep } from "@moku-labs/game/visual";

/**
 * The rest nodes of the round a visual test may start at. Both are checkpoints.
 */
export type RoundCheckpoint = "round/humanTurn" | "round/roundEnd/resultCard";

/**
 * Two seconds of frames: longer than every arrival, drop and celebration motion of the game.
 */
export const SETTLE_FRAMES = 120;

/**
 * The step that lets the motion on the screen come to rest before a picture.
 */
export const settled: VisualStep = { step: { frames: SETTLE_FRAMES } };

/**
 * The random state every visual test starts with, so the bot's draws are the same in every run.
 */
export const rng = { seed: 7, streams: {} };

/**
 * A moment no clock reaches. A session a test restores holds it where the game keeps a due moment.
 * The page of the pixel leg runs on the device clock, and a timer it armed on its own still fires
 * there: its `elapsed` then comes too early for this moment and changes nothing.
 */
export const NEVER_DUE = Number.MAX_SAFE_INTEGER;

/**
 * Mid-game, the human to move: X on cells 0 and 4, O on 2 and 3. Cell 8 wins for X.
 */
export const midGame: Board = [1, 0, 2, 2, 1, 0, 0, 0, 0];

/**
 * A new player, as a copy a test may hand to the runner.
 *
 * @returns The starting player.
 */
export function newPlayer(): Player {
  return structuredClone(startingPlayer);
}

/**
 * A player on Normal with the score 2, 1, 1: the save of the scenario `scored`.
 *
 * @returns The player.
 */
export function scoredPlayer(): Player {
  return { level: "normal", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 1 };
}

/**
 * The session of the splash and of Home: the one every start begins with, complete.
 *
 * @returns The starting session, as a copy.
 */
export function homeSession(): Session {
  return structuredClone(startingSession);
}

/**
 * The session of the splash at the end of its entrance: the starting one, with the minimum time
 * armed for `NEVER_DUE`. The page starts its own splash before a test restores this one, and the
 * timer of that start fires 2.4 seconds later. With the moment at 0 its `elapsed` would mark the
 * minimum time in the page and never in the headless leg.
 *
 * @returns The session.
 */
export function splashSession(): Session {
  const session = homeSession();

  return { ...session, splash: { ...session.splash, minDueAt: NEVER_DUE } };
}

/**
 * A complete session on the Board: the splash is over, the score row shows the player's score.
 *
 * @param board - The nine cells of the round.
 * @param player - The player the round belongs to.
 * @param round - What differs from a round that goes on with the human to move.
 * @returns The session.
 */
export function boardSession(board: Board, player: Player, round: Partial<Session> = {}): Session {
  return {
    ...homeSession(),
    screen: "board",
    board: [...board],
    shownScore: { ...player.score },
    splash: { pct: 1, ready: true, minPassed: true, minDueAt: 0 },
    ...round
  };
}

/**
 * Where a test on the Board starts, and the steps that show it. A start names no scene, and the
 * rest nodes of the round have none of their own, so the scene of the splash would stay mounted.
 * The first step restores the same state as a bookmark that names the scene `stage`; the second
 * lets the splash leave and the Board arrive.
 *
 * @param checkpoint - The checkpoint of the round the test starts at.
 * @param player - The saved player.
 * @param session - The complete session.
 * @returns The start of the test and its first steps.
 */
export function onBoard(
  checkpoint: RoundCheckpoint,
  player: Player,
  session: Session
): { start: VisualStart; enter: VisualStep[] } {
  // The graph hash is only read for a rest node that is no checkpoint, so it stays empty.
  const bookmark = { path: checkpoint, input: {}, player, session, rng, graph: "", scene: "stage" };

  return {
    start: { player, session, rng, checkpoint },
    enter: [{ restore: { bookmark } }, settled]
  };
}

/**
 * The step that shows a finished round at its celebration: the state the node `scoreRound` leaves,
 * restored at the rest node `round/celebrate`. That node is no checkpoint, so the step is a repro:
 * the runner enters it with the hash of the running graph. The scene stays the one `onBoard`
 * mounted.
 *
 * The round is restored, not played. The game ends the celebration at `now` plus a pause, and the
 * fake clock of the headless leg and the device clock of the page never agree on `now`: a played
 * round has another state in each leg. Here the celebration ends at `NEVER_DUE` in both, and no
 * node arms a timer.
 *
 * @param player - The saved player after the round: the result counted.
 * @param session - The complete session of the finished round.
 * @returns The step.
 */
export function celebrating(player: Player, session: Session): VisualStep {
  const repro = {
    player,
    session: { ...session, celebrateDueAt: NEVER_DUE },
    rng,
    checkpoint: "round/celebrate",
    route: []
  };

  return { restore: { repro } };
}
