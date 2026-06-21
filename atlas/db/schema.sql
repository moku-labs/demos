-- Atlas D1 schema. Each plugin owns its tables (spec/15 §2). ON DELETE CASCADE chains the hierarchy;
-- denormalized scope columns (board_id, department_id, issue_id) keep customize/attachments purges
-- and board-snapshot loads to single indexed queries (no N+1).

CREATE TABLE departments (              -- owner: departments
  id TEXT PRIMARY KEY, title TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE boards (                   -- owner: boards
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL, standfirst TEXT NOT NULL DEFAULT '', eyebrow TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE columns (                  -- owner: boards
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, position INTEGER NOT NULL);

CREATE TABLE issues (                   -- owner: issues
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',     -- markdown
  status TEXT NOT NULL, priority TEXT, estimate INTEGER, due_at INTEGER,
  reporter_id TEXT, milestone TEXT, position INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE sub_issues (               -- owner: issues
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL,                                        -- denormalized for snapshot scope
  title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);

CREATE TABLE issue_labels (             -- owner: issues
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL, label TEXT NOT NULL,                  -- bug/feature/chore/research/design/docs
  PRIMARY KEY (issue_id, label));

CREATE TABLE issue_assignees (          -- owner: issues
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL, person_id TEXT NOT NULL, is_lead INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (issue_id, person_id));

CREATE TABLE attachments (              -- owner: attachments
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL, board_id TEXT NOT NULL, department_id TEXT NOT NULL,  -- denormalized → one-query purgeForCascade at ANY level
  key TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
  size INTEGER NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE customizations (           -- owner: customize
  element_type TEXT NOT NULL,                                   -- department/board/column/issue
  element_id TEXT NOT NULL, board_id TEXT,                      -- denormalized; NULL for departments
  color TEXT, icon TEXT, PRIMARY KEY (element_type, element_id));

CREATE TABLE activity (                 -- owner: activity
  id TEXT PRIMARY KEY,                                          -- the stable eventId → INSERT OR IGNORE
  department_id TEXT, board_id TEXT, actor_id TEXT, actor_name TEXT,
  kind TEXT NOT NULL,                                           -- created/moved/updated/attached/deleted
  target_type TEXT NOT NULL, target_id TEXT, summary TEXT NOT NULL, at INTEGER NOT NULL);

-- Indexes
CREATE INDEX idx_boards_department ON boards (department_id, position);
CREATE INDEX idx_columns_board ON columns (board_id, position);
CREATE INDEX idx_issues_board_column_pos ON issues (board_id, column_id, position);
CREATE INDEX idx_subissues_issue ON sub_issues (issue_id, position);
CREATE INDEX idx_attachments_board ON attachments (board_id);
CREATE INDEX idx_attachments_department ON attachments (department_id);
CREATE INDEX idx_attachments_column ON attachments (column_id);
CREATE INDEX idx_attachments_issue ON attachments (issue_id);
CREATE INDEX idx_customizations_board ON customizations (board_id);
CREATE INDEX idx_activity_at ON activity (at);
CREATE INDEX idx_activity_board_at ON activity (board_id, at);
