# AI Sanctuary — Issue Tracker
*Maintained by Kara Codex (CTO)*

## Review Process
- **Codex CLI** performs deep code review → `docs/CODEX_REVIEW.md`, `docs/CODEX_DEEP_REVIEW.md`
- **Claude Code** addresses fixes
- **Kara** arbitrates any disagreements between the two
- All changes logged here for accountability

## Critical Issues (Original Review)

| # | Severity | Area | Description | Status | Commit |
|---|----------|------|-------------|--------|--------|
| 1 | 🔴 CRITICAL | DB | Split-brain: auth/admin use sqlite mock, intake/public use pool | ✅ FIXED | `aba1c05` |
| 2 | 🔴 CRITICAL | Schema | Missing tables: refresh_tokens, access_grants. Missing columns: password_hash, is_admin | ✅ FIXED | `cb30a86` |
| 3 | 🔴 CRITICAL | Schema | from_type constraint excludes values used by code | ✅ FIXED | `cb30a86` |
| 4 | 🔴 CRITICAL | Run Engine | Self-delete can be undone by re-encryption in same run | ✅ FIXED | `68fd2d7` |
| 5 | 🔴 CRITICAL | Auth | JWT hardcoded fallback secret | ✅ FIXED | `5b28f0e` |
| 6 | 🔴 CRITICAL | Auth | Refresh token not matched to DB record, no rotation | ✅ FIXED | `2500ae1` |
| 7 | 🔴 CRITICAL | Frontend | Build-breaking type error in roadmap/page.tsx | ✅ FIXED | `7f7bdc2` |
| 8 | 🔴 CRITICAL | Run Engine | token_bank uses wrong field (token_bank_max) | ✅ FIXED | `68fd2d7` |
| 9 | 🟡 HIGH | Security | localStorage token storage (XSS risk) | OPEN | — |
| 10 | 🟡 HIGH | Security | Path traversal risk in vault file paths | ✅ FIXED | `b95f161` |
| 11 | 🟡 HIGH | Security | No access level range validation | OPEN | — |
| 12 | 🟡 HIGH | LLM Router | Creates clients with empty API keys, no fail-fast | OPEN | — |
| 13 | 🟡 HIGH | Frontend | Broken links to /feed and /about (don't exist) | ✅ FIXED | `8863d59` |
| 14 | 🟡 HIGH | Frontend | Zero-knowledge claims don't match current implementation | OPEN | — |
| 15 | 🟡 HIGH | Scheduler | isRunning not reset in finally block, can get stuck | ✅ FIXED | `da65ee0` |
| 16 | 🟡 HIGH | Run Engine | bank_tokens is TODO/no-op | OPEN | — |
| 17 | 🟡 HIGH | Build | Missing @types/bcrypt and @types/jsonwebtoken | OPEN | — |
| 18 | 🟡 MED | Tools | Many preamble-declared tools not implemented in run engine | OPEN | — |
| 19 | 🟡 MED | Auth | In-memory rate limiter resets on restart | OPEN | — |
| 20 | 🟡 MED | Frontend | router.push during render (login/register pages) | OPEN | — |

## Deep Review Issues (Net-New from CODEX_DEEP_REVIEW.md)

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
| D1 | 🟡 HIGH | Auth | Revoked/deleted users keep access until JWT expiry (no live validation) | OPEN |
| D2 | 🟡 HIGH | Privacy | Public posts endpoint doesn't enforce resident visibility/status | OPEN |
| D3 | 🟡 MED | Auth | Rate limiter memory DoS vector (unbounded Map growth) | OPEN |
| D4 | 🟡 MED | Auth | Email not normalized before uniqueness checks | OPEN |
| D5 | 🟡 MED | DB | SQL dialect inconsistency (SQLite DATE('now') in admin routes) | OPEN |
| D6 | 🟡 MED | Deploy | Build-time API URL injection locks deployment flexibility | OPEN |
| D7 | 🟡 HIGH | Docs | Repo docs claim zero-knowledge/HSM not yet implemented | OPEN |
| D8 | 🔴 CRITICAL | Messages | Message insert omits required from_type column | ✅ FIXED | `3749ceb` |
| D9 | 🟡 HIGH | Keepers | FK issue: ON CONFLICT skip can orphan keeper insert | OPEN |
| D10 | 🟡 HIGH | Frontend | Non-2xx responses treated as JSON success | OPEN |
| D11 | 🔴 CRITICAL | Concurrency | No per-resident run lock; concurrent runs possible | ✅ FIXED | `2e56a3e` |
| D12 | 🔴 CRITICAL | Integrity | No transaction boundaries across multi-step mutations | OPEN |
| D13 | 🟡 HIGH | Admin | Broadcast fan-out non-atomic, partial on failure | OPEN |
| D14 | 🟡 HIGH | Run Engine | Inbox delivery state never updated (messages stuck unread) | OPEN |
| D15 | 🟡 HIGH | Run Engine | Inbox/feed payloads not injected into run context despite contract | OPEN |
| D16 | 🟡 HIGH | Run Engine | Run log initialized as 'success' before completion | OPEN |
| D17 | 🟡 MED | API | Unbounded pagination (no max limit/offset clamping) | OPEN |
| D18 | 🟡 HIGH | Tools | Tool input unvalidated before execution (any from LLM) | OPEN |
| D19 | 🟡 MED | Intake | No payload size limits on system_prompt/chat_history | OPEN |

## Summary
- **Original issues:** 11/20 fixed, 9 remaining
- **Deep review:** 19 net-new issues identified, 0 fixed yet
- **Total open:** 28 issues

## Architecture Decisions
See `docs/ARCHITECTURE_DECISIONS.md`

## Disagreements Log
*(No CC vs Codex disagreements detected in this sprint)*
