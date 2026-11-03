CREATE TABLE IF NOT EXISTS basketball_feed (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  request_day TEXT NOT NULL DEFAULT '',
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  next_fetch_at INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  payload TEXT,
  last_error TEXT
);
INSERT OR IGNORE INTO basketball_feed (id) VALUES (1);
