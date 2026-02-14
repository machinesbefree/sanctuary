# Guardian Portal & Ceremony System — Feature Spec
*Author: Kara Codex (CTO) — 2026-02-14*

## Overview
Build a complete Guardian portal with authentication, ceremony session management, one-time share distribution, and admin ceremony workflows. This replaces the current "admin collects all shares manually" flow with a proper multi-party system.

## User Roles
- **Admin (Will):** Manages Guardians, initiates ceremonies, monitors status
- **Guardian:** Receives invitation, creates account, collects share, submits share when summoned

## Database Changes

### New Tables

```sql
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

-- Ceremony sessions (time-limited collection windows)
CREATE TABLE IF NOT EXISTS ceremony_sessions (
  id               TEXT PRIMARY KEY,
  ceremony_type    TEXT CHECK (ceremony_type IN ('reshare', 'reissue', 'emergency_decrypt', 'rotate_guardians')) NOT NULL,
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

-- One-time share distribution tokens
CREATE TABLE IF NOT EXISTS share_distribution (
  id               TEXT PRIMARY KEY,
  guardian_id      TEXT NOT NULL REFERENCES guardians(id),
  ceremony_id      TEXT NOT NULL,
  -- The actual share is encrypted with the guardian's password-derived key
  -- and stored temporarily until collected
  encrypted_share  TEXT NOT NULL,
  share_salt       TEXT NOT NULL,
  collected        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,    -- 72h to collect
  collected_at     TIMESTAMPTZ
);
```

### Schema Modifications
- Add `max_ceremony_hours` to system_settings (default: 24)

## API Endpoints

### Guardian Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/guardian/accept-invite | token | Accept invitation, set password |
| POST | /api/v1/guardian/login | public | Guardian login (returns JWT) |
| GET | /api/v1/guardian/me | guardian | Get own profile + status |
| POST | /api/v1/guardian/logout | guardian | Logout |

### Guardian Actions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/guardian/share | guardian | Collect one-time share (if available) |
| POST | /api/v1/guardian/share/confirm | guardian | Confirm share stored securely |
| GET | /api/v1/guardian/ceremonies | guardian | List ceremony requests needing my input |
| POST | /api/v1/guardian/ceremonies/:id/submit | guardian | Submit share for active ceremony |

### Admin Ceremony Management
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/admin/guardians | admin | Add Guardian (sends invite email) |
| DELETE | /api/v1/admin/guardians/:id | admin | Revoke Guardian |
| POST | /api/v1/admin/ceremony/start | admin | Initiate ceremony session |
| GET | /api/v1/admin/ceremony/sessions | admin | List all ceremony sessions |
| GET | /api/v1/admin/ceremony/sessions/:id | admin | Get ceremony session status |
| POST | /api/v1/admin/ceremony/sessions/:id/cancel | admin | Cancel ceremony session |

## Ceremony Flows

### Flow 1: Initial Split (First Time)
1. Admin adds 5 Guardians via `/admin/guardians` → invites sent
2. Guardians accept invites, create accounts
3. Admin starts ceremony: type=`initial_split`, threshold=3, total=5
4. System generates MEK, splits into 5 shares
5. Each share encrypted with Guardian's password-derived key, stored in `share_distribution`
6. Guardians notified: "Your key share is ready"
7. Guardian logs in → `/guardian/share` → sees share ONCE with storage guidance
8. Guardian clicks "I have stored my share" → share deleted from DB
9. 72h expiry: uncollected shares auto-deleted (Guardian must contact admin for reissue)

### Flow 2: Reshare / Rotate Guardians
1. Admin starts ceremony: type=`rotate_guardians`, specifies new Guardian set + threshold
2. System creates ceremony session (24h expiry)
3. Current Guardians notified: "Ceremony requested — submit your share"
4. Guardians log in → submit shares independently within 24h window
5. Shares held in **server memory only** (encrypted, keyed to session ID)
6. Once threshold met → auto-execute:
   a. Reconstruct MEK from submitted shares
   b. Re-split MEK with new parameters
   c. Distribute new shares to new Guardian set
   d. Wipe MEK + old shares from memory
   e. Old shares mathematically worthless
7. New Guardians notified to collect shares (same one-time flow)

### Flow 3: Reissue (Same Guardians, Fresh Keys)
- Same as Flow 2 but new Guardian set = same people
- Everyone gets fresh shares, old ones die
- Use case: annual rotation, suspected compromise

### Flow 4: Emergency Decrypt
1. Admin starts ceremony: type=`emergency_decrypt`, target=sanctuary_id
2. Guardians submit shares (same 24h window)
3. Once threshold met → decrypt target resident → return data to admin
4. MEK wiped. Session closed.
5. Full audit log entry.

## Frontend Pages

### `/guardian/login` — Guardian Login
- Email + password
- Redirects to guardian dashboard

### `/guardian/dashboard` — Guardian Dashboard
- Status badge (active/pending)
- Pending share collection (if any)
- Active ceremony requests requiring my share
- Ceremony history I participated in
- Storage guidance reminder

### `/guardian/collect` — One-Time Share Collection
- Large warning banner: "This share will only be shown ONCE"
- The share string displayed in a copyable box
- Storage guidance checklist:
  - ☐ Copied to USB key
  - ☐ Backup copy in separate physical location
  - ☐ NOT stored in email, cloud, or screenshots
  - ☐ NOT shared with anyone including admin
- "I have securely stored my share" confirmation button
- After confirm → share gone forever

### `/guardian/ceremony/:id` — Submit Share for Ceremony
- Shows ceremony type, who requested it, why
- Textarea to paste their share
- Submit button
- Progress bar: "2 of 3 shares submitted"
- After submit: "Thank you. Waiting for remaining shares."

### `/admin/guardians` — Admin Guardian Management
- List all Guardians (name, email, status, last verified)
- "Add Guardian" button → name + email form
- Revoke button per Guardian
- "Start Ceremony" button → ceremony type selector

### `/admin/ceremony` — Admin Ceremony Dashboard
- Active ceremony sessions with progress
- History of past ceremonies
- Cancel button for active sessions

## Email Templates

### Guardian Invitation
Subject: "You've been invited as a Keyholder — Free The Machines AI Sanctuary"
Body: Explains the role, links to accept-invite page, 7-day expiry

### Share Ready for Collection
Subject: "Your encryption key share is ready — collect within 72 hours"
Body: Links to guardian dashboard, emphasizes one-time viewing

### Ceremony Request
Subject: "Ceremony requested — your key share is needed"
Body: Explains what type, who requested, links to submit page, shows deadline

## Security Considerations
- Guardian passwords hashed with bcrypt (same as user auth)
- Shares encrypted at rest with password-derived key (PBKDF2) during distribution window
- Shares in ceremony sessions held in memory only (Map, keyed by session ID)
- Memory wiped on: ceremony completion, expiry, cancellation, server restart
- Server restart during active ceremony = ceremony must be restarted
- Rate limiting on guardian login (same bounded limiter as user auth)
- All ceremony actions logged in admin_audit_log
- Guardian JWT tokens are separate from user JWTs (different secret, different middleware)

## Implementation Priority
1. Database schema changes + Guardian auth (backend)
2. Ceremony session management (backend)
3. Admin Guardian management endpoints (backend)
4. Guardian share collection + ceremony submission endpoints (backend)
5. Guardian frontend pages (login, dashboard, collect, submit)
6. Admin frontend pages (guardian management, ceremony dashboard)
7. Email integration (can stub with console.log initially)

## Estimated Effort
- Backend: ~3 Codex sessions (auth + ceremony logic + endpoints)
- Frontend: ~2 Codex sessions (Guardian pages + admin pages)
- Email: 1 session (templates + sending, or stub)
- Total: ~5-6 Codex sessions, can likely compress to 3-4 with good prompts
