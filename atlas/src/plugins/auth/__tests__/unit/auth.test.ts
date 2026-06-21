import { describe, it } from "vitest";

describe("auth", () => {
  it.todo("signIn mints a UUID token and stores a record with a future expiresAt");
  it.todo("resolveSession returns null for absent/expired/garbage tokens and deletes expired keys");
  it.todo("isAuthed parses both cookie and Bearer forms");
  it.todo("userId derivation is stable and never equals the raw email");
  it.todo("signOut deletes the session and is idempotent");
});
