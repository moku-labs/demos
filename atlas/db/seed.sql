-- Atlas demo seed — populates D1 so every screen looks real (design-context §8).
--
-- Boards are seeded into D1 ONLY. No KV seed is needed: boards.listForDepartment reads
-- the BOARDS_KV "boards:index" key first, but on a cache miss it falls back to D1
-- (reWarmDepartment → SELECT … FROM boards) and re-warms the slice. The deploy seed config
-- (src/server.ts) RESETS that KV key, so the index rebuilds from this D1 data on first read.
--
-- Conventions:
--   • Deterministic, legible text ids (dept-eng, board-platform, col-backlog, issue-ws-reconnect).
--   • Integer epoch-ms literals for all created_at / updated_at / at (fixed dates in early–mid 2026,
--     varied so ordering is meaningful). No SQL functions — portable.
--   • Column lists match db/schema.sql EXACTLY (names + order). Parents inserted before children.
--   • People ids (ak/ml/rt/js) are static constants (src/lib/people.ts), NOT a DB table.
--   • Enums: status backlog|in_progress|in_review|done · priority urgent|high|medium|low|none
--     · label bug|feature|chore|research|design|docs · activity.kind created|moved|updated|attached|deleted
--     · element_type department|board|column|issue.
--
-- NOTE: attachments are intentionally NOT seeded — their R2 blobs do not exist, so previews
-- would 404. Attachments are created at runtime via the attachments plugin.

-- ── Departments (5) ────────────────────────────────────────────────────────────
-- id, title, position, created_at
INSERT INTO departments (id, title, position, created_at) VALUES
  ('dept-eng',         'Engineering', 0, 1767225600000),  -- 2026-01-01
  ('dept-design',      'Design',      1, 1767225600000),
  ('dept-marketing',   'Marketing',   2, 1767225600000),
  ('dept-operations',  'Operations',  3, 1767225600000),
  ('dept-sales',       'Sales',       4, 1767225600000);

-- ── Boards ──────────────────────────────────────────────────────────────────────
-- id, department_id, title, standfirst, eyebrow, position, created_at
-- Engineering owns Platform / Mobile App / Infra; Design + Marketing get one each.
INSERT INTO boards (id, department_id, title, standfirst, eyebrow, position, created_at) VALUES
  ('board-platform',  'dept-eng',       'Platform',
    'The Cloudflare backbone — Durable Objects, Queues, R2, D1 and KV — kept boringly reliable.',
    'Engineering · Platform', 0, 1767830400000),  -- 2026-01-08
  ('board-mobile',    'dept-eng',       'Mobile App',
    'Shipping the native client: offline sync, push, and a release train that never derails.',
    'Engineering · Mobile App', 1, 1767830400000),
  ('board-infra',     'dept-eng',       'Infra',
    'CI, observability, and the cost of keeping the lights on at the edge.',
    'Engineering · Infra', 2, 1767830400000),
  ('board-brand',     'dept-design',    'Brand System',
    'One coherent voice across the product — tokens, type, and the editorial grid.',
    'Design · Brand System', 0, 1767916800000),  -- 2026-01-09
  ('board-campaigns', 'dept-marketing', 'Spring Campaign',
    'The Q2 launch narrative, from teaser to landing page to lifecycle email.',
    'Marketing · Spring Campaign', 0, 1768003200000);  -- 2026-01-10

-- ── Columns ─────────────────────────────────────────────────────────────────────
-- id, board_id, title, position
-- Platform is fully populated; other boards get the same four stages cheaply.
INSERT INTO columns (id, board_id, title, position) VALUES
  -- Platform (the showcase board)
  ('col-backlog',     'board-platform',  'Backlog',     0),
  ('col-progress',    'board-platform',  'In Progress', 1),
  ('col-review',      'board-platform',  'In Review',   2),
  ('col-done',        'board-platform',  'Done',        3),
  -- Mobile App
  ('col-mob-backlog', 'board-mobile',    'Backlog',     0),
  ('col-mob-progress','board-mobile',    'In Progress', 1),
  ('col-mob-review',  'board-mobile',    'In Review',   2),
  ('col-mob-done',    'board-mobile',    'Done',        3),
  -- Infra
  ('col-inf-backlog', 'board-infra',     'Backlog',     0),
  ('col-inf-progress','board-infra',     'In Progress', 1),
  ('col-inf-review',  'board-infra',     'In Review',   2),
  ('col-inf-done',    'board-infra',     'Done',        3),
  -- Brand System
  ('col-brn-backlog', 'board-brand',     'Backlog',     0),
  ('col-brn-progress','board-brand',     'In Progress', 1),
  ('col-brn-review',  'board-brand',     'In Review',   2),
  ('col-brn-done',    'board-brand',     'Done',        3),
  -- Spring Campaign
  ('col-cmp-backlog', 'board-campaigns', 'Backlog',     0),
  ('col-cmp-progress','board-campaigns', 'In Progress', 1),
  ('col-cmp-review',  'board-campaigns', 'In Review',   2),
  ('col-cmp-done',    'board-campaigns', 'Done',        3);

-- ── Issues (Platform board — 12) ─────────────────────────────────────────────────
-- id, board_id, column_id, title, description, status, priority, estimate, due_at,
-- reporter_id, milestone, position, created_at, updated_at
-- status MUST match the column's stage. position is per-column ordering.

INSERT INTO issues (id, board_id, column_id, title, description, status, priority, estimate, due_at, reporter_id, milestone, position, created_at, updated_at) VALUES
  -- Backlog (status = backlog)
  ('issue-ws-reconnect', 'board-platform', 'col-backlog',
    'Fix flaky WebSocket reconnect',
    '## Symptom

Clients on flaky mobile networks **silently stop receiving patches** after a brief
disconnect. The Durable Object never sees a clean close, so the socket lingers.

### Plan
- Add a heartbeat ping every 20s
- Treat 2 missed pongs as dead and force-close
- Resume from the last acked patch sequence on reconnect

See the [hibernation API notes](https://developers.cloudflare.com/durable-objects/) for the
WebSocket details.',
    'backlog', 'urgent', 5, 1771545600000, 'ak', 'Vol. 4 · Spring Cycle', 0, 1768435200000, 1770249600000),  -- due 2026-02-20

  ('issue-do-hibernation', 'board-platform', 'col-backlog',
    'Durable Object hibernation audit',
    'Audit every DO for **hibernation readiness**. Long-lived in-memory state blocks
hibernation and burns wall-clock billing.

- Move ephemeral caches behind `state.storage`
- Verify `webSocketMessage` handlers are registered, not closure-captured
- Measure idle eviction before/after',
    'backlog', 'high', 8, NULL, 'ml', 'Vol. 4 · Spring Cycle', 1, 1768521600000, 1768780800000),

  ('issue-kv-session-gc', 'board-platform', 'col-backlog',
    'KV session GC',
    'Expired demo sessions accumulate in `SESSIONS_KV`. Add a lazy GC sweep on the auth gate
so stale keys are reaped on read, plus a TTL on write.',
    'backlog', 'medium', 3, NULL, 'rt', NULL, 2, 1768608000000, 1768608000000),

  ('issue-queue-backpressure', 'board-platform', 'col-backlog',
    'Queue backpressure dashboard',
    '### Goal

Surface the activity queue depth and consumer lag so we can _see_ backpressure before
it bites.

1. Emit queue depth as a metric
2. Chart consumer batch latency
3. Alert when the dead-letter queue is non-empty',
    'backlog', NULL, 5, NULL, 'js', NULL, 3, 1768694400000, 1768694400000),

  -- In Progress (status = in_progress)
  ('issue-r2-thumbnails', 'board-platform', 'col-progress',
    'R2 attachment thumbnails',
    '## R2 thumbnails

Generate and cache **thumbnail variants** for image attachments so the issue page never
ships full-resolution blobs to the card grid.

- Derive a 320px WebP on first request
- Store the variant under a `thumb/` key prefix
- Fall back to the original for non-image types',
    'in_progress', 'high', 8, 1772668800000, 'ak', 'Vol. 4 · Spring Cycle', 0, 1768780800000, 1770854400000),  -- due 2026-03-05

  ('issue-d1-migration-runner', 'board-platform', 'col-progress',
    'D1 migration runner',
    'A repeatable **migration runner** for D1 so schema changes apply cleanly across local,
preview, and production.

- Track applied migrations in a `_migrations` table
- Run pending files in lexical order
- Make it idempotent (skip already-applied)',
    'in_progress', 'urgent', 5, 1772150400000, 'ml', 'Vol. 4 · Spring Cycle', 1, 1768867200000, 1770940800000),  -- due 2026-02-27

  ('issue-realtime-fanout', 'board-platform', 'col-progress',
    'Realtime fan-out batching',
    'Batch board patches inside a single DO tick so a burst of moves fans out as **one frame**
instead of N. Reduces socket chatter on busy boards.',
    'in_progress', 'medium', 3, NULL, 'rt', NULL, 2, 1768953600000, 1771027200000),

  -- In Review (status = in_review)
  ('issue-attachment-cascade', 'board-platform', 'col-review',
    'Cascade-purge R2 on delete',
    '## Cascade purge

When a board, column, or issue is deleted, its R2 blobs must be purged **before** the D1
CASCADE removes the attachment rows (otherwise the keys are orphaned).

- Read attachment keys via the denormalized scope columns
- `purgeForCascade` deletes blobs, then D1 deletes rows
- Verified against board / column / issue levels',
    'in_review', 'high', 5, 1771200000000, 'js', 'Vol. 4 · Spring Cycle', 0, 1769040000000, 1771200000000),  -- due 2026-02-16

  ('issue-idempotent-activity', 'board-platform', 'col-review',
    'Idempotent activity records',
    'Make the activity consumer **idempotent** — the queue can redeliver, so `INSERT OR IGNORE`
keyed on the stable `eventId` keeps the feed from doubling up.',
    'in_review', 'medium', 2, NULL, 'ak', NULL, 1, 1769126400000, 1771286400000),

  -- Done (status = done)
  ('issue-auth-kv-gate', 'board-platform', 'col-done',
    'KV-backed auth session gate',
    'Gate every mutation behind a **KV session lookup**. Demo auth issues a session id on
sign-in; the worker resolves the actor from `SESSIONS_KV` on each request.',
    'done', 'high', 5, 1769904000000, 'ml', 'Vol. 3 · Winter Cycle', 0, 1768262400000, 1769990400000),  -- due 2026-02-01

  ('issue-broadcast-service', 'board-platform', 'col-done',
    'Realtime broadcast service',
    '## Broadcast service

A thin **broadcast** wrapper over the board Durable Object so any plugin can fan a typed
`BoardPatch` to connected clients without owning the socket.

Shipped in Wave 1.',
    'done', 'medium', 3, NULL, 'rt', 'Vol. 3 · Winter Cycle', 1, 1768176000000, 1769904000000),

  ('issue-schema-denorm', 'board-platform', 'col-done',
    'Denormalize scope columns',
    'Add denormalized `board_id` / `department_id` columns to the join + attachment tables so
cascade purges and snapshot loads are **single indexed queries** — no N+1.',
    'done', 'low', 2, NULL, 'js', 'Vol. 3 · Winter Cycle', 2, 1768089600000, 1769817600000);

-- ── Issues (a few on other boards so they aren't empty) ──────────────────────────
INSERT INTO issues (id, board_id, column_id, title, description, status, priority, estimate, due_at, reporter_id, milestone, position, created_at, updated_at) VALUES
  ('issue-mob-offline', 'board-mobile', 'col-mob-progress',
    'Offline-first sync queue',
    'Queue mutations locally and replay them on reconnect so the app stays usable on the subway.',
    'in_progress', 'high', 8, NULL, 'ak', NULL, 0, 1768780800000, 1770854400000),
  ('issue-mob-push', 'board-mobile', 'col-mob-backlog',
    'Push notification opt-in',
    'A gentle, well-timed prompt for push permission — never on first launch.',
    'backlog', 'medium', 3, NULL, 'rt', NULL, 0, 1768867200000, 1768867200000),
  ('issue-brn-tokens', 'board-brand', 'col-brn-progress',
    'Design token pipeline',
    'Generate light + dark token sets from one source of truth and ship them as CSS variables.',
    'in_progress', 'high', 5, NULL, 'js', NULL, 0, 1768953600000, 1771027200000),
  ('issue-cmp-landing', 'board-campaigns', 'col-cmp-review',
    'Spring landing page',
    'The hero, the narrative, the call to action — editorial and fast.',
    'in_review', 'urgent', 5, 1771977600000, 'ml', 'Spring Launch', 0, 1769040000000, 1771200000000);

-- ── Sub-issues (checklists; denormalized board_id) ───────────────────────────────
-- id, issue_id, board_id, title, done, position
INSERT INTO sub_issues (id, issue_id, board_id, title, done, position) VALUES
  -- WebSocket reconnect (2/3 done)
  ('sub-ws-1', 'issue-ws-reconnect', 'board-platform', 'Add heartbeat ping interval',         1, 0),
  ('sub-ws-2', 'issue-ws-reconnect', 'board-platform', 'Force-close on 2 missed pongs',        1, 1),
  ('sub-ws-3', 'issue-ws-reconnect', 'board-platform', 'Resume from last acked sequence',      0, 2),
  -- R2 thumbnails (1/3 done)
  ('sub-r2-1', 'issue-r2-thumbnails', 'board-platform', 'Derive 320px WebP variant',           1, 0),
  ('sub-r2-2', 'issue-r2-thumbnails', 'board-platform', 'Store under thumb/ key prefix',        0, 1),
  ('sub-r2-3', 'issue-r2-thumbnails', 'board-platform', 'Fall back to original for non-image', 0, 2),
  -- D1 migration runner (2/2 done — fully checked)
  ('sub-d1-1', 'issue-d1-migration-runner', 'board-platform', 'Track applied migrations table', 1, 0),
  ('sub-d1-2', 'issue-d1-migration-runner', 'board-platform', 'Run pending files in order',     1, 1),
  -- Cascade purge (5 items, 3 done)
  ('sub-cp-1', 'issue-attachment-cascade', 'board-platform', 'Read keys via scope columns',     1, 0),
  ('sub-cp-2', 'issue-attachment-cascade', 'board-platform', 'Purge blobs before D1 delete',    1, 1),
  ('sub-cp-3', 'issue-attachment-cascade', 'board-platform', 'Verify board-level cascade',      1, 2),
  ('sub-cp-4', 'issue-attachment-cascade', 'board-platform', 'Verify column-level cascade',     0, 3),
  ('sub-cp-5', 'issue-attachment-cascade', 'board-platform', 'Verify issue-level cascade',      0, 4);

-- ── Issue labels (taxonomy: bug/feature/chore/research/design/docs) ──────────────
-- issue_id, board_id, label
INSERT INTO issue_labels (issue_id, board_id, label) VALUES
  ('issue-ws-reconnect',        'board-platform', 'bug'),
  ('issue-do-hibernation',      'board-platform', 'research'),
  ('issue-do-hibernation',      'board-platform', 'chore'),
  ('issue-kv-session-gc',       'board-platform', 'chore'),
  ('issue-queue-backpressure',  'board-platform', 'feature'),
  ('issue-r2-thumbnails',       'board-platform', 'feature'),
  ('issue-d1-migration-runner', 'board-platform', 'feature'),
  ('issue-d1-migration-runner', 'board-platform', 'chore'),
  ('issue-realtime-fanout',     'board-platform', 'feature'),
  ('issue-attachment-cascade',  'board-platform', 'bug'),
  ('issue-idempotent-activity', 'board-platform', 'bug'),
  ('issue-auth-kv-gate',        'board-platform', 'feature'),
  ('issue-broadcast-service',   'board-platform', 'feature'),
  ('issue-schema-denorm',       'board-platform', 'chore'),
  ('issue-mob-offline',         'board-mobile',   'feature'),
  ('issue-brn-tokens',          'board-brand',    'design'),
  ('issue-cmp-landing',         'board-campaigns','docs');

-- ── Issue assignees (people ak/ml/rt/js; one lead per multi-assignee issue) ──────
-- issue_id, board_id, person_id, is_lead
INSERT INTO issue_assignees (issue_id, board_id, person_id, is_lead) VALUES
  ('issue-ws-reconnect',        'board-platform', 'ak', 1),
  ('issue-ws-reconnect',        'board-platform', 'rt', 0),
  ('issue-do-hibernation',      'board-platform', 'ml', 1),
  ('issue-kv-session-gc',       'board-platform', 'rt', 1),
  ('issue-queue-backpressure',  'board-platform', 'js', 1),
  ('issue-queue-backpressure',  'board-platform', 'ak', 0),
  ('issue-r2-thumbnails',       'board-platform', 'ak', 1),
  ('issue-r2-thumbnails',       'board-platform', 'js', 0),
  ('issue-d1-migration-runner', 'board-platform', 'ml', 1),
  ('issue-realtime-fanout',     'board-platform', 'rt', 1),
  ('issue-attachment-cascade',  'board-platform', 'js', 1),
  ('issue-attachment-cascade',  'board-platform', 'ml', 0),
  ('issue-idempotent-activity', 'board-platform', 'ak', 1),
  ('issue-auth-kv-gate',        'board-platform', 'ml', 1),
  ('issue-broadcast-service',   'board-platform', 'rt', 1),
  ('issue-schema-denorm',       'board-platform', 'js', 1),
  ('issue-mob-offline',         'board-mobile',   'ak', 1),
  ('issue-brn-tokens',          'board-brand',    'js', 1),
  ('issue-cmp-landing',         'board-campaigns','ml', 1);

-- ── Customizations (color + icon — showcases the Customize feature) ──────────────
-- element_type, element_id, board_id (NULL for departments), color, icon
INSERT INTO customizations (element_type, element_id, board_id, color, icon) VALUES
  ('department', 'dept-eng',      NULL,             '#E4572E', 'terminal'),  -- vermilion + terminal
  ('board',      'board-platform','board-platform', '#3A6EA5', 'layers'),
  ('board',      'board-infra',   'board-infra',    '#6C757D', 'database'),
  ('column',     'col-progress',  'board-platform', '#E4572E', 'bolt'),      -- in-progress glows vermilion
  ('issue',      'issue-ws-reconnect', 'board-platform', '#C8553D', 'bug');

-- ── Activity (historical Record rows — populates the Activity drawer) ────────────
-- id (stable, doubles as idempotency key), department_id, board_id, actor_id, actor_name,
-- kind, target_type, target_id, summary, at  (ascending timestamps)
INSERT INTO activity (id, department_id, board_id, actor_id, actor_name, kind, target_type, target_id, summary, at) VALUES
  ('act-0001', 'dept-eng', 'board-platform', 'js', 'June Sato',  'created',  'board',  'board-platform',
    'Created the Platform board', 1768435200000),  -- 2026-01-15
  ('act-0002', 'dept-eng', 'board-platform', 'js', 'June Sato',  'created',  'issue',  'issue-schema-denorm',
    'Added “Denormalize scope columns”', 1768521600000),
  ('act-0003', 'dept-eng', 'board-platform', 'rt', 'Robin Tao',  'moved',    'issue',  'issue-broadcast-service',
    'Moved “Realtime broadcast service” to Done', 1769904000000),  -- 2026-02-01
  ('act-0004', 'dept-eng', 'board-platform', 'ml', 'Mateo Luna', 'updated',  'issue',  'issue-auth-kv-gate',
    'Set priority of “KV-backed auth session gate” to High', 1769990400000),
  ('act-0005', 'dept-eng', 'board-platform', 'ml', 'Mateo Luna', 'moved',    'issue',  'issue-auth-kv-gate',
    'Moved “KV-backed auth session gate” to Done', 1770076800000),
  ('act-0006', 'dept-eng', 'board-platform', 'ak', 'Anya Kovač', 'created',  'issue',  'issue-ws-reconnect',
    'Added “Fix flaky WebSocket reconnect”', 1768435200000 + 86400000),
  ('act-0007', 'dept-eng', 'board-platform', 'ak', 'Anya Kovač', 'attached', 'issue',  'issue-r2-thumbnails',
    'Attached design-mock.png to “R2 attachment thumbnails”', 1770854400000),  -- 2026-02-12
  ('act-0008', 'dept-eng', 'board-platform', 'js', 'June Sato',  'moved',    'issue',  'issue-attachment-cascade',
    'Moved “Cascade-purge R2 on delete” to In Review', 1771200000000),  -- 2026-02-16
  ('act-0009', 'dept-eng', 'board-platform', 'rt', 'Robin Tao',  'updated',  'column', 'col-progress',
    'Customized the In Progress column', 1771286400000),
  ('act-0010', 'dept-eng', 'board-platform', 'ml', 'Mateo Luna', 'deleted',  'issue',  'issue-legacy-poller',
    'Deleted “Legacy long-poll fallback”', 1771372800000),
  ('act-0011', 'dept-eng', 'board-platform', 'ak', 'Anya Kovač', 'updated',  'issue',  'issue-ws-reconnect',
    'Set priority of “Fix flaky WebSocket reconnect” to Urgent', 1771459200000),
  ('act-0012', 'dept-design', 'board-brand', 'js', 'June Sato',  'created',  'issue',  'issue-brn-tokens',
    'Added “Design token pipeline”', 1771545600000);  -- 2026-02-20
