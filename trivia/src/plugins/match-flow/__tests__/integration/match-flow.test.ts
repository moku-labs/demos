import { describe, it } from "vitest";

describe("match-flow (integration)", () => {
  it.todo(
    "full round on an inMemory() two-app harness: join → start → language → pick → answer → reveal"
  );
  it.todo("the question slice never carries correctSlot/answerCheck on the controller replica");
  it.todo("the host clock fires a timeout → steal; a disconnect mid-question advances the machine");
});
