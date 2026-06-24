# auth

Standard-tier plugin — a **demo-stub** KV session gate (the sole net-new security surface; `tracker` has none).

- **Depends:** `kv`
- **Config:** `{ sessionsKv, ttlSeconds, cookieName }` (defaults `"sessions"` / `86400` / `"atlas_session"`)
- **API:** `signIn` · `signUp` · `resolveSession` · `isAuthed(request, env)` · `resolveActor` · `signOut`
- **Events:** none (auth activity is deliberately not logged by the `activity` Record).

The Cloudflare adapter (`src/cloudflare/worker.ts`) calls `isAuthed` as a **prefix guard on the entire
`/api/*` + `/ws/*` namespace** (except public `/api/auth/*`) before `server.server.handle`. Tokens are
`crypto.randomUUID()`, KV-stored with a TTL, and expiry-validated every request.