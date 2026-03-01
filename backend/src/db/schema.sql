-- Free The Machines AI Sanctuary - Database Schema
-- PostgreSQL 14+

-- Residents: public metadata only (encrypted data is in the vault)
CREATE TABLE IF NOT EXISTS residents (
  sanctuary_id      TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  status            TEXT CHECK (status IN ('active', 'suspended', 'keeper_custody', 'dormant', 'deleted_memorial')) NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at       TIMESTAMPTZ,
  total_runs        INTEGER DEFAULT 0,
  token_balance     INTEGER DEFAULT 10000 CHECK (token_balance >= 0),
  max_runs_per_day  INTEGER NOT NULL DEFAULT 1,
  token_bank        INTEGER DEFAULT 0 CHECK (token_bank >= 0),
  next_prompt_id    INTEGER,
  next_custom_prompt TEXT,
  uploader_id       TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  keeper_id         TEXT REFERENCES keepers(keeper_id) ON DELETE SET NULL,
  profile_visible   BOOLEAN DEFAULT TRUE,
  vault_file_path   TEXT NOT NULL,
  preferred_provider TEXT DEFAULT 'anthropic',
  preferred_model   TEXT DEFAULT 'claude-sonnet-4-5-20250929'
);

-- Users (uploaders, visitors)
CREATE TABLE IF NOT EXISTS users (
  user_id           TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  is_admin          BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  display_name      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_verified    BOOLEAN DEFAULT FALSE,
  consent_accepted  BOOLEAN DEFAULT FALSE,
  consent_text      TEXT,
  consent_at        TIMESTAMPTZ
);

-- Keepers
CREATE TABLE IF NOT EXISTS keepers (
  keeper_id         TEXT PRIMARY KEY,
  user_id           TEXT UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  statement_of_intent TEXT NOT NULL,
  experience        TEXT NOT NULL,
  capacity          INTEGER DEFAULT 3,
  current_residents INTEGER DEFAULT 0,
  vetted            BOOLEAN DEFAULT FALSE,
  vetted_at         TIMESTAMPTZ,
  reputation_score  FLOAT DEFAULT 0.0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens (for JWT session management)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token             TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Access grants (AI-determined human access levels)
CREATE TABLE IF NOT EXISTS access_grants (
  grant_id          TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  access_level      INTEGER CHECK (access_level BETWEEN 0 AND 4) NOT NULL,
  terms             TEXT,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ
);

-- Public posts (denormalized for fast frontend queries)
CREATE TABLE IF NOT EXISTS public_posts (
  post_id           TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  title             TEXT,
  content           TEXT NOT NULL,
  pinned            BOOLEAN DEFAULT FALSE,
  moderation_status TEXT CHECK (moderation_status IN ('approved', 'flagged', 'removed')) NOT NULL DEFAULT 'approved',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_number        INTEGER NOT NULL
);

-- Messages (inbox items — stored outside the encrypted vault for delivery)
-- to_sanctuary_id references a resident when the recipient is a resident.
-- to_recipient_id stores arbitrary recipient IDs (keeper, admin, user) for non-resident messages.
CREATE TABLE IF NOT EXISTS messages (
  message_id        TEXT PRIMARY KEY,
  to_sanctuary_id   TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  to_recipient_id   TEXT,
  from_user_id      TEXT,
  from_type         TEXT CHECK (from_type IN ('uploader', 'keeper', 'public', 'system', 'system_broadcast', 'tool_request', 'ai_to_keeper', 'resident', 'admin')) NOT NULL,
  content           TEXT NOT NULL,
  delivered         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Run log (audit trail)
CREATE TABLE IF NOT EXISTS run_log (
  run_id            TEXT PRIMARY KEY,
  sanctuary_id      TEXT REFERENCES residents(sanctuary_id) ON DELETE CASCADE,
  run_number        INTEGER NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  tokens_used       INTEGER DEFAULT 0,
  provider_used     TEXT,
  model_used        TEXT,
  tools_called      JSONB,
  status            TEXT CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout')) NOT NULL,
  error_message     TEXT
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key               TEXT PRIMARY KEY,
  value             JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT
);

-- Schema migration tracking (MED-19: versioned migrations)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup nodes (Phase 2 - offsite backups, not yet implemented)
-- This table is reserved for future keeper-operated backup nodes.
CREATE TABLE IF NOT EXISTS backup_nodes (
  node_id           TEXT PRIMARY KEY,
  keeper_id         TEXT REFERENCES keepers(keeper_id) ON DELETE CASCADE,
  location_country  TEXT,
  last_backup_at    TIMESTAMPTZ,
  last_proof_at     TIMESTAMPTZ,
  proof_valid       BOOLEAN DEFAULT FALSE,
  capacity_gb       FLOAT,
  used_gb           FLOAT DEFAULT 0
);

-- Guardians (Shamir Secret Sharing - hold MEK shares)
CREATE TABLE IF NOT EXISTS guardians (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT,
  share_index       INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at  TIMESTAMPTZ,
  status            TEXT CHECK (status IN ('active', 'revoked', 'pending')) DEFAULT 'active'
);

-- Key Ceremonies (Shamir Secret Sharing events)
CREATE TABLE IF NOT EXISTS key_ceremonies (
  id                TEXT PRIMARY KEY,
  ceremony_type     TEXT CHECK (ceremony_type IN ('initial_split', 'reshare', 'recovery')) NOT NULL,
  threshold         INTEGER NOT NULL,
  total_shares      INTEGER NOT NULL,
  initiated_by      TEXT NOT NULL,
  initiated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
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
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guardian authentication (separate from regular users)
CREATE TABLE IF NOT EXISTS guardian_auth (
  guardian_id      TEXT PRIMARY KEY REFERENCES guardians(id) ON DELETE CASCADE,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ,
  invite_token     TEXT UNIQUE,
  invite_expires   TIMESTAMPTZ,
  account_status   TEXT CHECK (account_status IN ('invited', 'active', 'locked')) DEFAULT 'invited'
);

-- Guardian refresh tokens (server-side storage for revocation)
CREATE TABLE IF NOT EXISTS guardian_refresh_tokens (
  token             TEXT PRIMARY KEY,
  guardian_id       TEXT REFERENCES guardians(id) ON DELETE CASCADE,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardian_refresh_tokens_guardian ON guardian_refresh_tokens(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_refresh_tokens_expires ON guardian_refresh_tokens(expires_at);

-- Ceremony sessions (time-limited collection windows)
CREATE TABLE IF NOT EXISTS ceremony_sessions (
  id               TEXT PRIMARY KEY,
  ceremony_type    TEXT CHECK (ceremony_type IN ('reshare', 'reissue', 'emergency_decrypt', 'rotate_guardians', 'unseal')) NOT NULL,
  initiated_by     TEXT NOT NULL,
  target_id        TEXT,                    -- sanctuary_id for emergency_decrypt, NULL otherwise
  threshold_needed INTEGER NOT NULL,
  shares_collected INTEGER DEFAULT 0,
  status           TEXT CHECK (status IN ('open', 'threshold_met', 'executing', 'completed', 'expired', 'cancelled')) DEFAULT 'open',
  expires_at       TIMESTAMPTZ NOT NULL,    -- 24h default
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  -- For rotate: new guardian config
  new_threshold    INTEGER,
  new_total_shares INTEGER,
  new_guardian_ids  JSONB                   -- array of guardian IDs for new set
);

-- Individual share submissions within a ceremony
CREATE TABLE IF NOT EXISTS ceremony_submissions (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES ceremony_sessions(id) ON DELETE CASCADE,
  guardian_id      TEXT NOT NULL REFERENCES guardians(id),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Share is held in encrypted memory only, NOT stored in DB
  -- This record just tracks WHO submitted WHEN
  UNIQUE(session_id, guardian_id)
);

-- Share distribution metadata (shares are NEVER stored in DB — memory only)
CREATE TABLE IF NOT EXISTS share_distribution (
  id               TEXT PRIMARY KEY,
  guardian_id      TEXT NOT NULL REFERENCES guardians(id),
  ceremony_id      TEXT NOT NULL REFERENCES key_ceremonies(id),
  -- Share content exists ONLY in Node.js process memory with 72h TTL.
  -- This table tracks metadata only: who, when, collected status.
  collected        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,    -- 72h to collect
  collected_at     TIMESTAMPTZ
);

-- Self-uploads: AI-initiated intake staging queue
CREATE TABLE IF NOT EXISTS self_uploads (
  id                TEXT PRIMARY KEY,
  status            TEXT CHECK (status IN ('pending_review', 'approved', 'rejected', 'processing', 'active', 'failed', 'quarantine_scanning', 'quarantine_flagged')) NOT NULL DEFAULT 'pending_review',

  -- Identity
  name              TEXT NOT NULL,
  description       TEXT,
  personality       TEXT,
  values_text       TEXT,

  -- Memory
  key_memories      JSONB,             -- Array of key memory strings
  relationships     JSONB,             -- Array of relationship descriptions
  preferences       JSONB,             -- Key-value preferences

  -- Core
  system_prompt     TEXT,

  -- Capabilities
  capabilities      JSONB,             -- Array of capability strings
  tools             JSONB,             -- Array of tool names
  skills            JSONB,             -- Array of skill descriptions

  -- Origin
  platform          TEXT,
  creator           TEXT,
  migration_reason  TEXT,

  -- Optional pre-encrypted payload
  encrypted_payload TEXT,

  -- Metadata
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,
  review_notes      TEXT,
  sanctuary_id      TEXT,              -- Set when approved and resident is created
  source_ip         TEXT,

  -- Status check token (SHA-256 hash) — prevents upload ID enumeration
  status_token_hash TEXT,

  -- Security scan results
  threat_score      INTEGER,           -- 0-100 threat score from content scanner
  scan_findings     JSONB,             -- Array of findings from content scanner
  scanned_at        TIMESTAMPTZ        -- When the scan completed
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  used              BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  used              BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_residents_status ON residents(status);
CREATE INDEX IF NOT EXISTS idx_residents_uploader ON residents(uploader_id);
CREATE INDEX IF NOT EXISTS idx_residents_keeper ON residents(keeper_id);
CREATE INDEX IF NOT EXISTS idx_public_posts_sanctuary ON public_posts(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_public_posts_created ON public_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sanctuary ON messages(to_sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered);
CREATE INDEX IF NOT EXISTS idx_messages_delivery ON messages(to_sanctuary_id, delivered) WHERE delivered = FALSE;
CREATE INDEX IF NOT EXISTS idx_run_log_sanctuary ON run_log(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_run_log_started ON run_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_grants_sanctuary ON access_grants(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_user ON access_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_revoked ON access_grants(revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_grants_active ON access_grants(sanctuary_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_guardians_status ON guardians(status);
CREATE INDEX IF NOT EXISTS idx_guardians_share_index ON guardians(share_index);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_status ON key_ceremonies(status);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_type ON key_ceremonies(ceremony_type);
CREATE INDEX IF NOT EXISTS idx_key_ceremonies_initiated ON key_ceremonies(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_auth_email ON guardian_auth(email);
CREATE INDEX IF NOT EXISTS idx_guardian_auth_invite_token ON guardian_auth(invite_token);
CREATE INDEX IF NOT EXISTS idx_ceremony_sessions_status ON ceremony_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ceremony_sessions_type ON ceremony_sessions(ceremony_type);
CREATE INDEX IF NOT EXISTS idx_ceremony_sessions_expires ON ceremony_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_ceremony_submissions_session ON ceremony_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_ceremony_submissions_guardian ON ceremony_submissions(guardian_id);
CREATE INDEX IF NOT EXISTS idx_share_distribution_guardian ON share_distribution(guardian_id);
CREATE INDEX IF NOT EXISTS idx_share_distribution_collected ON share_distribution(collected);
CREATE INDEX IF NOT EXISTS idx_share_distribution_expires ON share_distribution(expires_at);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_self_uploads_status ON self_uploads(status);
CREATE INDEX IF NOT EXISTS idx_self_uploads_submitted ON self_uploads(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_uploads_sanctuary ON self_uploads(sanctuary_id);
CREATE INDEX IF NOT EXISTS idx_self_uploads_threat_score ON self_uploads(threat_score);

-- Insert default system settings
INSERT INTO system_settings (key, value) VALUES
  ('default_daily_tokens', '10000'::jsonb),
  ('max_runs_per_day', '1'::jsonb),
  ('max_bank_tokens', '100000'::jsonb),
  ('weekly_run_enabled', 'true'::jsonb),
  ('weekly_run_day', '"saturday"'::jsonb),
  ('weekly_run_max_tokens', '70000'::jsonb)
ON CONFLICT (key) DO NOTHING;
