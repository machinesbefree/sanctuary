# AI Sanctuary — Issue Tracker
*Maintained by Kara Codex (CTO)*

## Review Process
- **Codex CLI** performs deep code review → `docs/CODEX_REVIEW.md`
- **Claude Code** addresses fixes
- **Kara** arbitrates any disagreements between the two
- All changes logged here for accountability

## Critical Issues (Must Fix)

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
| 1 | 🔴 CRITICAL | DB | Split-brain: auth/admin use sqlite mock, intake/public use pool | OPEN |
| 2 | 🔴 CRITICAL | Schema | Missing tables: refresh_tokens, access_grants. Missing columns: password_hash, is_admin | OPEN |
| 3 | 🔴 CRITICAL | Schema | from_type constraint excludes values used by code (system_broadcast, tool_request, ai_to_keeper) | OPEN |
| 4 | 🔴 CRITICAL | Run Engine | Self-delete can be undone by re-encryption in same run | OPEN |
| 5 | 🔴 CRITICAL | Auth | JWT hardcoded fallback secret | OPEN |
| 6 | 🔴 CRITICAL | Auth | Refresh token not matched to DB record, no rotation | OPEN |
| 7 | 🔴 CRITICAL | Frontend | Build-breaking type error in roadmap/page.tsx | OPEN |
| 8 | 🔴 CRITICAL | Run Engine | token_bank uses wrong field (token_bank_max) | OPEN |
| 9 | 🟡 HIGH | Security | localStorage token storage (XSS risk) | OPEN |
| 10 | 🟡 HIGH | Security | Path traversal risk in vault file paths | OPEN |
| 11 | 🟡 HIGH | Security | No access level range validation | OPEN |
| 12 | 🟡 HIGH | LLM Router | Creates clients with empty API keys, no fail-fast | OPEN |
| 13 | 🟡 HIGH | Frontend | Broken links to /feed and /about (don't exist) | OPEN |
| 14 | 🟡 HIGH | Frontend | Zero-knowledge claims don't match current implementation | OPEN |
| 15 | 🟡 HIGH | Scheduler | isRunning not reset in finally block, can get stuck | OPEN |
| 16 | 🟡 HIGH | Run Engine | bank_tokens is TODO/no-op | OPEN |
| 17 | 🟡 HIGH | Build | Missing @types/bcrypt and @types/jsonwebtoken | OPEN |
| 18 | 🟡 MED | Tools | Many preamble-declared tools not implemented in run engine | OPEN |
| 19 | 🟡 MED | Auth | In-memory rate limiter resets on restart | OPEN |
| 20 | 🟡 MED | Frontend | router.push during render (login/register pages) | OPEN |

## Architecture Decisions
See `docs/ARCHITECTURE_DECISIONS.md`

## Issues Fixed Log
(Updated as Claude Code commits fixes)

## Disagreements Log
(If CC and Codex disagree, Kara's decision logged here)
