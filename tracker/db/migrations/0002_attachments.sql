-- Backfill the `attachments` table for D1 databases that were migrated before it landed in
-- 0001_init.sql. `IF NOT EXISTS` makes this a no-op on databases that already have the table (fresh
-- databases create it from 0001) — it only matters for an already-migrated local/remote D1, where
-- 0001 is marked applied and so never re-runs. Without the table, uploading a card attachment fails
-- (the INSERT has no table) and the activity never persists. Mirrors 0001_init.sql + db/schema.sql.
CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  card_id      TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL
);

-- Speeds up the board snapshot's attachments join (getBoard: attachments ⋈ cards WHERE board_id).
CREATE INDEX IF NOT EXISTS idx_attachments_card ON attachments (card_id);
