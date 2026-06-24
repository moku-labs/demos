# activity

Standard-tier plugin — the read-only **Record**, and the **only** event subscriber in Atlas (the
`hooks` side of the two-channel showcase).

- **Depends:** `departments` · `boards` · `issues` · `attachments` · `customize` · `d1` · `queues`
- **Config:** `{ activityQueue }` (default `"activity"`)
- **API:** `recordActivity(env, message)` (idempotent) · `list(env, { boardId?, limit? })`
- **Events:** `activity:recorded` (observability-only — a deliberate orphan; nothing hooks it)

`hooks` subscribe to **every** domain event (`departments:*`, `boards:*`, `issues:*`, `attachments:*`,
`customize:changed`); each handler builds an `ActivityMessage` (reusing the mutation-site `eventId`) and
**enqueues** it. The queue consumer (`server.ts` `onMessage`) calls `recordActivity`, an
`INSERT OR IGNORE` on `eventId` — so the at-least-once queue can redeliver without duplicate rows.
Hooks never write D1 directly; `recordActivity` is the sole durable writer. `activity` does **not**
broadcast and does **not** depend on `realtime` (the drawer is load-on-open).