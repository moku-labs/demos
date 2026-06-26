import { describe, it } from "vitest";

describe("match-flow (unit)", () => {
  it.todo(
    "phase transitions: lobby → languageVote → roundIntro → categoryPick → question → reveal"
  );
  it.todo("rotation: round → activePeer; steal = next untried connected player");
  it.todo("ramp maps round → tier (R1-4 easy, R5-8 medium, R9-12 hard)");
  it.todo(
    "steal machine (a) active-correct (b) active-wrong→steal-correct (c) →steal-wrong→unanswered"
  );
  it.todo(
    "steal machine (d) active-timeout→steal (e) steal-timeout (f) 1-player no-steal (g) disconnect"
  );
  it.todo(
    "category-exhausted stays in categoryPick + raises the toast; play-again resets scores, keeps lang+seen"
  );
});
