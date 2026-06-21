import { describe, it } from "vitest";

describe("auth (integration)", () => {
  it.todo("signIn → isAuthed(request with session cookie) === true");
  it.todo("no-token and garbage-token requests both yield isAuthed === false (guard → 401)");
  it.todo("the /ws/* upgrade path is guarded before the DO is reached");
});
