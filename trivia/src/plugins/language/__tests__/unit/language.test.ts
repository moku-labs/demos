import { describe, it } from "vitest";

describe("language (unit)", () => {
  it.todo("tally: majority wins; tie → defaultLang; zero votes → defaultLang");
  it.todo("last-vote-wins per peer; leading recomputes live");
  it.todo("openVote arms the timer + sets deadlineTs; expiry calls onConfirm once");
  it.todo(
    "cancelVote clears without confirming; onStop clears a pending timer (no double-confirm)"
  );
});
