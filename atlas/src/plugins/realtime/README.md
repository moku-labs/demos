# realtime

Standard-tier plugin — the per-board Durable Object broadcast **service**.

- **Depends:** `durableObjects`
- **Config:** `{ boardDo: string }` (default `"board"`)
- **API:** `broadcast(env, boardId, patch)` — fans a `BoardPatch` out to every socket on the board's DO channel.
- **Events:** none. `realtime` is a service — `require`d inline by board-scoped mutation plugins, never an event subscriber (spec/11 §2.7).