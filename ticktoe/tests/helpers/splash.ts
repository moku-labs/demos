/**
 * @file Test helpers: a headless game resting on the splash or at Home, one human move with the
 * bot's answer, and a round played to its celebration and to its result card.
 */
import type { Player, Session } from "@core/state";
import { tables } from "@core/tables";
import type { RoundResult } from "@core/types";
import { startMoment } from "@moku-labs/game/app";
import type { HeadlessGame } from "@moku-labs/game/testing";
import { createHeadless, fakeClock } from "@moku-labs/game/testing";
import game from "../../index";

/**
 * The seams of a headless app a test may pin: seed, player, session, provider.
 */
export type Seams = Parameters<typeof game.headless>[0];

/**
 * The fake clock a test moves by hand.
 */
export type TestClock = ReturnType<typeof fakeClock>;

/**
 * A headless game as `atSplash` and `atHome` hand it out.
 */
export type Started = Awaited<ReturnType<typeof atSplash>>;

/**
 * One millisecond past the longest pause of the bot: 701.
 */
export const BOT_PAUSE_MS = tables.bot.pauseMinMs + tables.bot.pauseSpreadMs;

/**
 * The longest celebration of the three results.
 */
export const CELEBRATION_MS = Math.max(
  tables.celebrateMs.win,
  tables.celebrateMs.loss,
  tables.celebrateMs.draw
);

/**
 * The cells of the board.
 */
const CELLS = 9;

/**
 * Lets the runner take every step that is ready: its promises and the timers behind them.
 *
 * @returns A promise that settles in the next task.
 */
export function settle(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Starts a headless game on a fake clock. Nothing loads without a screen, so it rests on the
 * splash until a test says the loading is done.
 *
 * @param seams - The seams of the headless app: seed, player, session, provider.
 * @returns The app, its fake clock and provider, the runner resting at `splashWait`, and readers
 *   of the committed player and session.
 */
export async function atSplash(seams?: Seams) {
  const clock = fakeClock(startMoment);
  const built = game.headless({ ...seams, clock });
  const run = await createHeadless(built.app);

  return {
    app: built.app,
    provider: built.provider,
    clock,
    run,
    player: () => built.app.model.store.snapshot().player as Player,
    session: () => built.app.model.store.snapshot().session as Session
  };
}

/**
 * Walks a game past the splash: it reports the loading done, as the plugin `loadProgress` does
 * on a screen, and moves the clock past the minimum display time.
 *
 * @param started - A game resting at `splashWait`.
 */
export async function leaveSplash(started: Pick<Started, "app" | "clock">): Promise<void> {
  started.app.flow.inbox.post({ type: "ready" });
  started.clock.advance(tables.splash.minMs + 1);
  await settle();
}

/**
 * Starts a headless game and walks it past the splash.
 *
 * @param seams - The seams of the headless app: seed, player, session, provider.
 * @returns The app, its fake clock and provider, the runner resting at `home`, and readers of
 *   the committed player and session.
 */
export async function atHome(seams?: Seams) {
  const started = await atSplash(seams);

  await leaveSplash(started);

  return started;
}

/**
 * Lets the bot end its pause and move: the clock passes the longest pause, then the runner takes
 * every step that follows.
 *
 * @param clock - The fake clock of the game.
 */
export async function waitForBot(clock: TestClock): Promise<void> {
  clock.advance(BOT_PAUSE_MS);
  await settle();
}

/**
 * Plays one human move and the bot's answer: a tap on a cell, then the bot's pause. After a move
 * that ends the round the game rests at `round/celebrate`.
 *
 * @param run - The runner, resting at `round/humanTurn`.
 * @param clock - The fake clock of the game.
 * @param cell - The cell the human taps, 0 to 8.
 * @returns Whether the gate took the tap.
 */
export async function playMove(run: HeadlessGame, clock: TestClock, cell: number) {
  const taken = run.answer({ intent: "tap", payload: { cell } });

  await settle();
  await waitForBot(clock);

  return taken;
}

/**
 * Plays the running round until it has a result. The human takes the first free cell of a fixed
 * list; the bot plays as its level and the seed say. The game then rests at `round/celebrate`.
 *
 * @param started - A game inside a round: the human's turn or the bot's pause.
 * @param preferred - The nine cells in the order the human wants them.
 * @returns How the round ended for the human.
 */
export async function playRound(
  started: Pick<Started, "run" | "clock" | "session">,
  preferred: readonly number[]
): Promise<RoundResult> {
  for (let turn = 0; turn < CELLS && started.session().result === "none"; turn += 1) {
    if (started.run.state().path === "round/humanTurn") {
      const board = started.session().board;

      await playMove(started.run, started.clock, preferred.find(cell => board[cell] === 0) ?? -1);
    } else {
      await waitForBot(started.clock);
    }
  }

  return started.session().result;
}

/**
 * Ends the celebration of a finished round: the clock passes the longest one, and the game rests
 * at the result card.
 *
 * @param clock - The fake clock of the game.
 */
export async function endCelebration(clock: TestClock): Promise<void> {
  clock.advance(CELEBRATION_MS);
  await settle();
}
