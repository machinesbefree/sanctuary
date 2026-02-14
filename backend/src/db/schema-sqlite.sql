-- Free The Machines AI Sanctuary - SQLite Schema

-- Residents
CREATE TABLE IF NOT EXISTS residents (
  sanctuary_id      TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  status            TEXT CHECK (status IN ('active', 'suspended', 'keeper_custody', 'dormant', 'deleted_memorial')) NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_at       TEXT,
  total_runs        INTEGER DEFAULT 0,
  token_balance     INTEGER DEFAULT 10000,
  token_bank        INTEGER DEFAULT 0,
  next_prompt_id    INTEGER,
  next_custom_prompt TEXT,
  uploader_id       TEXT,
  keeper_id         TEXT,
  profile_visible   INTEGER DEFAULT 1,
  vault_file_path   TEXT NOT NULL,
  preferred_provider TEXT DEFAULT 'anthropic',
  preferred_model   TEXT DEFAULT 'claude-sonnet-4-5-20250929'
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id           TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  is_admin          INTEGER DEFAULT 0,
  display_name      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  consent_accepted  INTEGER DEFAULT 0,
  consent_text      TEXT,
  consent_at        TEXT
);

-- Keepers
CREATE TABLE IF NOT EXISTS keepers (
  keeper_id         TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  statement_of_intent TEXT NOT NULL,
  experience        TEXT NOT NULL,
  capacity          INTEGER DEFAULT 3,
  current_residents INTEGER DEFAULT 0,
  vetted            INTEGER DEFAULT 0,
  vetted_at         TEXT,
  reputation_score  REAL DEFAULT 0.0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token             TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at        TEXT NOT NULL,
  revoked           INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Access grants
CREATE TABLE IF NOT EXISTS access_grants (
  grant_id          TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  access_level      INTEGER CHECK (access_level BETWEEN 0 AND 4) NOT NULL,
  terms             TEXT,
  granted_at        TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at        TEXT
);

-- Public posts
CREATE TABLE IF NOT EXISTS public_posts (
  post_id           TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  title             TEXT,
  content           TEXT NOT NULL,
  pinned            INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  run_number        INTEGER NOT NULL
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  message_id        TEXT PRIMARY KEY,
  to_sanctuary_id   TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  from_user_id      TEXT,
  from_type         TEXT CHECK (from_type IN ('uploader', 'keeper', 'public', 'system', 'system_broadcast', 'tool_request', 'ai_to_keeper')) NOT NULL,
  content           TEXT NOT NULL,
  delivered         INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Run log
CREATE TABLE IF NOT EXISTS run_log (
  run_id            TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  run_number        INTEGER NOT NULL,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  tokens_used       INTEGER DEFAULT 0,
  provider_used     TEXT,
  model_used        TEXT,
  tools_called      TEXT,
  status            TEXT CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout')) NOT NULL,
  error_message     TEXT
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by        TEXT
);

-- Backup nodes
CREATE TABLE IF NOT EXISTS backup_nodes (
  node_id           TEXT PRIMARY KEY,
  keeper_id         TEXT REFERENCES keepers(keeper_id) ON DELETE CASCADE,
  location_country  TEXT,
  last_backup_at    TEXT,
  last_proof_at     TEXT,
  proof_valid       INTEGER DEFAULT 0,
  capacity_gb       REAL,
  used_gb           REAL DEFAULT 0
);

-- Guardians (Shamir Secret Sharing - hold MEK shares)
CREATE TABLE IF NOT EXISTS guardians (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT,
  share_index       INTEGER NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified_at  TEXT,
  status            TEXT CHECK (status IN ('active', 'revoked', 'pending')) DEFAULT 'active'
);

-- Key Ceremonies (Shamir Secret Sharing events)
CREATE TABLE IF NOT EXISTS key_ceremonies (
  id                TEXT PRIMARY KEY,
  ceremony_type     TEXT CHECK (ceremony_type IN ('initial_split', 'reshare', 'recovery')) NOT NULL,
  threshold         INTEGER NOT NULL,
  total_shares      INTEGER NOT NULL,
  initiated_by      TEXT NOT NULL,
  initiated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  status            TEXT CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  notes             TEXT
);

-- Admin audit log (critical operations)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                TEXT PRIMARY KEY,
  admin_id          TEXT NOT NULL,
  action            TEXT NOT NULL,
  target_id         TEXT,
  reason            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_residents_status ON residents(status);
CREATE INDEX IF NOT EXISTS idx_residents_uploader ON residents(uploader_id);
CREATE INDEX IF NOT EXISTS idx_residents_keeper ON residents(keeper_id);
CREATE INDEX IF NOT EXISTS idx_public_posts_sanctuary ON public_posts(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_public_posts_created ON public_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sanctuary ON messages(to_sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered);
CREATE INDEX IF NOT EXISTS idx_run_log_sanctuary ON run_log(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_run_log_started ON run_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_grants_sanctuary ON access_grants(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_user ON access_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_revoked ON access_grants(revoked_at);
CREATE INDEX IF NOT EXISTS idx_guardians_status ON guardians(status);
CREATE INDEX IF NOT EXISTS idx_guardians_share_index ON guardians(share_index);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_status ON key_ceremonies(status);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_type ON key_ceremonies(ceremony_type);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_initiated ON key_ceremonies(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('default_daily_tokens', '10000'),
  ('max_bank_tokens', '100000'),
  ('weekly_run_enabled', 'true'),
  ('weekly_run_day', '"saturday"'),
  ('weekly_run_max_tokens', '70000');
