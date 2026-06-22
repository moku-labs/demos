-- 0002_users — signed-in user profiles (#6: profile → assignable). Owner: users plugin.
-- A demo user picks a display name + avatar colour; their stable auth id (u_<sha256(email)>, the same
-- value used as an issue assignee/reporter person_id) makes them a selectable assignee, and the chosen
-- colour token paints their avatar. `color` is a customize-palette token (e.g. --label-green) or NULL.

CREATE TABLE users (                    -- owner: users
  id TEXT PRIMARY KEY,                  -- stable u_<sha256(email)> from auth (also the assignee person_id)
  name TEXT NOT NULL,
  color TEXT,                           -- a customize palette token (e.g. --label-green); NULL = default
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
