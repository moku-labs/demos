-- Tracker D1 schema (migration 0001) — applied via `wrangler d1 migrations apply tracker`.
-- Mirrors src/schema.sql (the human-readable reference). D1 is the durable source of truth;
-- KV indexes boards, R2 holds attachment blobs, the Board Durable Object fans out live patches,
-- and Queues drive the activity feed.

CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  summary  TEXT NOT NULL,
  at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  card_id      TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_board_column_position ON cards (board_id, column_id, position);
CREATE INDEX IF NOT EXISTS idx_activity_board_at ON activity (board_id, at);
