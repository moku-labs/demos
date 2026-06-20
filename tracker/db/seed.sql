-- Tracker demo seed — predefined boards + issues (mock data).
-- Apply with: bun run seed:local   (= wrangler d1 execute tracker --local --file db/seed.sql)
-- Idempotent: every row uses a fixed `seed-*` id, so re-running replaces the demo data and never
-- touches boards you created by hand. Run AFTER migrations (the tables must already exist).

-- Wipe previous demo rows first (explicit, in child→parent order, so it works whether or not D1
-- enforces ON DELETE CASCADE for this connection).
DELETE FROM cards   WHERE board_id LIKE 'seed-%';
DELETE FROM columns WHERE board_id LIKE 'seed-%';
DELETE FROM boards  WHERE id       LIKE 'seed-%';

-- ── Board 1: Engineering Sprint ───────────────────────────────────────────
INSERT INTO boards (id, title, created_at) VALUES
  ('seed-eng', 'Engineering Sprint', 1750000000000);

INSERT INTO columns (id, board_id, title, position) VALUES
  ('seed-eng-backlog', 'seed-eng', 'Backlog',     0),
  ('seed-eng-doing',   'seed-eng', 'In Progress', 1),
  ('seed-eng-review',  'seed-eng', 'In Review',    2),
  ('seed-eng-done',    'seed-eng', 'Done',         3);

INSERT INTO cards (id, board_id, column_id, title, description, position, created_at) VALUES
  ('seed-eng-c1', 'seed-eng', 'seed-eng-backlog', 'Add OAuth login',            'Support Google and GitHub sign-in. Spike the provider SDK and scope token refresh.', 0, 1750000001000),
  ('seed-eng-c2', 'seed-eng', 'seed-eng-backlog', 'Rate-limit the public API',  'Token bucket per IP at the edge. Agree limits with the infra team first.',          1, 1750000002000),
  ('seed-eng-c3', 'seed-eng', 'seed-eng-backlog', 'Dark mode',                  'Honour prefers-color-scheme and add a manual toggle persisted to localStorage.',    2, 1750000003000),
  ('seed-eng-c4', 'seed-eng', 'seed-eng-doing',   'Migrate source of truth to D1', 'Move durable writes to D1; keep KV as the fast read index with a fallback.',      0, 1750000004000),
  ('seed-eng-c5', 'seed-eng', 'seed-eng-doing',   'Fix flaky checkout test',    'Intermittent failure in the payments e2e suite — likely a race on the webhook mock.', 1, 1750000005000),
  ('seed-eng-c6', 'seed-eng', 'seed-eng-review',  'Board drag-and-drop',        'Optimistic reorder reconciled over the WebSocket. PR open, awaiting review.',       0, 1750000006000),
  ('seed-eng-c7', 'seed-eng', 'seed-eng-done',    'Set up CI pipeline',         'Typecheck, lint, test + coverage, and a deploy-on-main job.',                       0, 1750000007000),
  ('seed-eng-c8', 'seed-eng', 'seed-eng-done',    'Project scaffold',           'Initial app composition, route table, and the base layout.',                        1, 1750000008000);

-- ── Board 2: Product Launch ───────────────────────────────────────────────
INSERT INTO boards (id, title, created_at) VALUES
  ('seed-launch', 'Product Launch', 1750000100000);

INSERT INTO columns (id, board_id, title, position) VALUES
  ('seed-launch-ideas',   'seed-launch', 'Ideas',       0),
  ('seed-launch-planned', 'seed-launch', 'Planned',     1),
  ('seed-launch-doing',   'seed-launch', 'In Progress', 2),
  ('seed-launch-shipped', 'seed-launch', 'Shipped',     3);

INSERT INTO cards (id, board_id, column_id, title, description, position, created_at) VALUES
  ('seed-launch-c1', 'seed-launch', 'seed-launch-ideas',   'Launch walkthrough video', 'A 60-second product tour for the landing page and socials.',  0, 1750000101000),
  ('seed-launch-c2', 'seed-launch', 'seed-launch-ideas',   'Customer case study',      'Interview an early adopter and publish before launch week.',  1, 1750000102000),
  ('seed-launch-c3', 'seed-launch', 'seed-launch-planned', 'Pricing page refresh',     'New tiers and an annual toggle. Coordinate copy with finance.', 0, 1750000103000),
  ('seed-launch-c4', 'seed-launch', 'seed-launch-planned', 'Docs overhaul',            'Quickstart, API reference, and three end-to-end guides.',     1, 1750000104000),
  ('seed-launch-c5', 'seed-launch', 'seed-launch-doing',   'Triage beta feedback',     'Sort the 40+ beta reports into bugs, requests, and wins.',    0, 1750000105000),
  ('seed-launch-c6', 'seed-launch', 'seed-launch-doing',   'Announcement email',       'Draft, design, and schedule the launch-day send.',            1, 1750000106000),
  ('seed-launch-c7', 'seed-launch', 'seed-launch-shipped', 'Landing page',             'New hero, feature grid, and social proof. Live.',             0, 1750000107000);

-- ── Board 3: Bug Triage ───────────────────────────────────────────────────
INSERT INTO boards (id, title, created_at) VALUES
  ('seed-bugs', 'Bug Triage', 1750000200000);

INSERT INTO columns (id, board_id, title, position) VALUES
  ('seed-bugs-reported',  'seed-bugs', 'Reported',  0),
  ('seed-bugs-triaged',   'seed-bugs', 'Triaged',   1),
  ('seed-bugs-fixing',    'seed-bugs', 'Fixing',    2),
  ('seed-bugs-verified',  'seed-bugs', 'Verified',  3);

INSERT INTO cards (id, board_id, column_id, title, description, position, created_at) VALUES
  ('seed-bugs-c1', 'seed-bugs', 'seed-bugs-reported', 'Crash on empty board title', 'Submitting a blank title 500s instead of validating. Repro: create a board, leave title empty.', 0, 1750000201000),
  ('seed-bugs-c2', 'seed-bugs', 'seed-bugs-reported', 'Avatars 404 on Safari',      'Profile images fail to load on Safari 17 only — likely a CORS preflight issue.',                1, 1750000202000),
  ('seed-bugs-c3', 'seed-bugs', 'seed-bugs-reported', 'Search ignores accents',     'Searching ''cafe'' should match ''café''. Normalize to NFD before comparing.',                   2, 1750000203000),
  ('seed-bugs-c4', 'seed-bugs', 'seed-bugs-triaged',  'Slow board load over 2s',    'Boards with 200+ cards take over two seconds. Profile the snapshot query.',                      0, 1750000204000),
  ('seed-bugs-c5', 'seed-bugs', 'seed-bugs-fixing',   'Duplicate activity entries', 'The queue consumer occasionally records an event twice. Add an idempotency key.',                0, 1750000205000),
  ('seed-bugs-c6', 'seed-bugs', 'seed-bugs-verified', 'Logout does not clear session', 'Fixed: the session cookie is now cleared server-side on logout. Verified in staging.',         0, 1750000206000);
