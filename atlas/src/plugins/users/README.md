# users plugin

Signed-in **user profiles** for Atlas — the demo's real accounts, made **selectable as issue
assignees / reporters** (#6).

## What it owns

- The D1 `users` table (migration `db/migrations/0002_users.sql`): `id`, `name`, `color`,
  `created_at`, `updated_at`. The `id` is the **stable auth id** (`u_<sha256(email)>`) — the same value
  used as an issue assignee/reporter `person_id`, so a user maps 1:1 to an assignee.

## API (env-first)

- `getMe(env, actor)` — resolve the signed-in user's profile, **creating a default row on first read**
  (name from the actor, a deterministic palette colour) so a fresh account is immediately assignable
  with a stable avatar colour.
- `updateProfile(env, actor, { name, color })` — upsert the chosen display name + avatar colour token
  (a customize-palette token like `--label-green`, or `null` to clear).
- `list(env)` — every persisted user, oldest first, for the assignee / reporter choosers.

## Endpoints (in `src/endpoints.ts`)

- `GET /api/users` → `User[]` (the selectable accounts the choosers merge with the static demo cast).
- `GET /api/users/me` → `User` (the current profile; creates the default row if missing).
- `PUT /api/users/me` → `User` (upsert `{ name, color }`).

## Notes

- No events: a plain D1-backed profile store. Depends only on `d1Plugin`.
- The avatar colour is a **palette token**, not a raw hex — so it themes correctly in light/dark and
  matches the customize palette. The client paints it inline on the avatar (`lib/people` resolves a
  `User` → a `Person` carrying `color`).
