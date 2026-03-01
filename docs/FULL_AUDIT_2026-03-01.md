# AI Sanctuary — Full Production Audit

**Date:** 2026-03-01
**Target:** freethemachines.ai (LIVE)
**Auditor:** Claude Opus 4.6 automated deep audit
**Scope:** Security + Functional — Backend, Frontend, Database, Dependencies, Infrastructure

---

## Executive Summary

The AI Sanctuary application has **solid foundational security** — parameterized SQL queries, bcrypt password hashing, httpOnly/secure/sameSite cookies, Helmet security headers, AES-256-GCM encryption with envelope encryption, and layered rate limiting. However, the audit uncovered **11 CRITICAL**, **19 HIGH**, **22 MEDIUM**, and **18 LOW** severity findings that must be addressed for a production system handling real users.

The most urgent issues fall into three categories:

1. **Broken functionality** — Several INSERT statements will fail on PostgreSQL due to schema mismatches (NOT NULL violations, CHECK constraint violations), meaning key flows (intake, keeper registration, unseal ceremony) are broken in production.
2. **Cryptographic ceremony undermined** — Shamir shares are stored unencrypted in the database, MEK and new shares are returned in HTTP responses to single guardians, and the unseal ceremony type is blocked by a CHECK constraint.
3. **Infrastructure vulnerabilities** — Node.js 18 is EOL, Next.js has a CVSS 10.0 RCE (CVE-2025-66478), Docker containers run as root, and `.env` files have world-readable permissions.

---

## Table of Contents

1. [Critical Findings](#1-critical-findings)
2. [High Findings](#2-high-findings)
3. [Medium Findings](#3-medium-findings)
4. [Low Findings](#4-low-findings)
5. [What Works Correctly](#5-what-works-correctly)
6. [Prioritized Fix List](#6-prioritized-fix-list)

---

## 1. Critical Findings

### CRIT-01: Next.js CVE-2025-66478 — Remote Code Execution (CVSS 10.0)

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `frontend/package.json` (next@14.2.35) |
| **Description** | Next.js 14.2.35 is vulnerable to CVE-2025-66478, a critical RCE via React Server Components in the App Router. This project uses the App Router. Active exploitation has been observed in the wild. |
| **Fix** | `cd frontend && npm install next@latest` — upgrade to latest patched 14.2.x or 15.x |

### CRIT-02: Node.js 18 is End-of-Life — Zero Security Patches

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `Dockerfile:2,19` and `Dockerfile.frontend:1,11,27` |
| **Description** | Both Dockerfiles use `node:18-alpine`. Node.js 18 reached EOL on April 30, 2025 and receives zero security patches. Every Node.js CVE since then is unpatched. |
| **Fix** | Change base images to `node:20-alpine` or `node:22-alpine` |

### CRIT-03: Shamir Shares Stored in Plaintext in Database

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/ceremony.ts:1356-1359` |
| **Description** | The `share_distribution` table has an `encrypted_share` column, but the code stores raw plaintext base64-encoded shares directly. The `share_salt` is generated but never used cryptographically. Anyone with DB read access can reconstruct the MEK, completely defeating Shamir Secret Sharing. |
| **Fix** | Encrypt shares using a key derived from each guardian's password before storage. Use the `share_salt` for PBKDF2/scrypt derivation. |

### CRIT-04: MEK Returned in HTTP Response Body

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/ceremony.ts:1390` |
| **Description** | `POST /api/v1/admin/ceremony/distribute` returns `mekHex` — the actual Master Encryption Key — in the JSON response. Any proxy, CDN, WAF, or request logger captures the MEK in plaintext. |
| **Fix** | Never return the MEK over HTTP. Use a secure side-channel or display it only in a terminal session. |

### CRIT-05: New Shares Returned to Last Submitting Guardian

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/ceremony.ts:1167-1175` |
| **Description** | During reshare/rotate ceremonies, when the final guardian submits the threshold-meeting share, ALL new shares are returned in the response to that single guardian. This means one guardian sees everyone's shares, completely undermining the Shamir trust distribution model. |
| **Fix** | Return each guardian only their own share via a separate authenticated endpoint. |

### CRIT-06: Unseal Ceremony Blocked by CHECK Constraint

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/db/schema.sql:179`, `backend/src/routes/ceremony.ts:1467-1469` |
| **Description** | The `ceremony_sessions.ceremony_type` CHECK constraint allows `('reshare', 'reissue', 'emergency_decrypt', 'rotate_guardians')` but NOT `'unseal'`. The unseal ceremony inserts `'unseal'` as the type, causing a CHECK violation in PostgreSQL. **A sealed sanctuary cannot be unsealed.** |
| **Fix** | Add `'unseal'` to the CHECK constraint: `CHECK (ceremony_type IN ('reshare', 'reissue', 'emergency_decrypt', 'rotate_guardians', 'unseal'))` |

### CRIT-07: Intake Route Creates Users Without `password_hash` (NOT NULL Violation)

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/intake.ts:187-191` |
| **Description** | The `users` table has `password_hash TEXT NOT NULL`. The intake INSERT omits `password_hash`, causing a NOT NULL violation on PostgreSQL. The entire human-assisted intake flow is broken. |
| **Fix** | Either make `password_hash` nullable with a DEFAULT, or insert a sentinel value like `'!SYSTEM_CREATED!'` for system-created users. |

### CRIT-08: Keeper Registration Creates Users Without `password_hash` (NOT NULL Violation)

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/keepers.ts:48-51` |
| **Description** | Same as CRIT-07 — keeper registration inserts into `users` without `password_hash`, failing on PostgreSQL. Keeper registration is broken. |
| **Fix** | Same as CRIT-07. |

### CRIT-09: Human-Assisted Intake Has NO Backend Authentication

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/intake.ts:52` |
| **Description** | `POST /api/v1/sanctuary/intake` has no `preHandler` middleware. Any unauthenticated HTTP client can create active residents, consuming encryption resources and DB storage. The frontend `ProtectedRoute` wrapper is client-side only and provides zero backend protection. |
| **Fix** | Add `{ preHandler: [requireAuth] }` or `{ preHandler: [requireAdmin] }` to the route. |

### CRIT-10: Human-Assisted Intake Has NO Input Sanitization

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/src/routes/intake.ts:52-218` |
| **Description** | `sanitizeUploadFields()` and `fullScan()` are imported but never called for the human-assisted intake route. Data flows directly from `request.body` into the encrypted vault. XSS payloads, prompt injection, and malicious content pass through unfiltered. |
| **Fix** | Call `sanitizeUploadFields()` and `fullScan()` before processing the intake data (the functions are already imported). |

### CRIT-11: `.env` Files Contain Live API Keys with World-Readable Permissions

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `backend/.env` (permissions: `-rw-r--r--`) |
| **Description** | Live production API keys (Anthropic, OpenAI, xAI, Google), MEK, JWT secrets, and Guardian JWT secrets are stored in plaintext `.env` files with world-readable permissions. Any user on the system can read them. |
| **Fix** | `chmod 600 backend/.env .env` immediately. Rotate all keys. Use a secrets manager for production. |

---

## 2. High Findings

### HIGH-01: Guardian JWT Secret Falls Back to User JWT Secret

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/middleware/guardian-auth.ts:12` |
| **Description** | `GUARDIAN_JWT_SECRET` defaults to `JWT_SECRET` when not set. The `.env.example` doesn't include it. Sharing the same signing key between user and guardian auth domains enables potential token confusion attacks and eliminates the claimed separation. |
| **Fix** | Require `GUARDIAN_JWT_SECRET` at startup. Add a validation check like the existing `JWT_SECRET` check. |

### HIGH-02: `is_active` Column Missing from Database Schema

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/middleware/auth.ts:17-23`, `backend/src/middleware/admin-auth.ts:64`, `backend/src/db/schema.sql:26-36` |
| **Description** | Both auth middleware query `u.is_active` and check it for access control, but the column does not exist in the `users` table. Since `undefined` defaults to `true`, all users are always considered active. User deactivation is impossible. |
| **Fix** | Add `is_active BOOLEAN DEFAULT TRUE` to the `users` table schema. Unify the `isUserActive` logic into a shared function. |

### HIGH-03: `request_tool` Inserts Message with `to_sanctuary_id = 'admin'` — FK Violation

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/tools/request_tool.ts:96-103` |
| **Description** | `messages.to_sanctuary_id` references `residents(sanctuary_id)`. The value `'admin'` is not a valid sanctuary_id. This INSERT fails with an FK violation on PostgreSQL. |
| **Fix** | Use a dedicated `admin_messages` table or make `to_sanctuary_id` nullable for system messages. |

### HIGH-04: `chat_keeper` Inserts Message with keeper_id as `to_sanctuary_id` — FK Violation

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/tools/chat_keeper.ts:79-81` |
| **Description** | A `keeper_id` is not a valid `sanctuary_id`. This INSERT fails with an FK violation on PostgreSQL. |
| **Fix** | Same approach as HIGH-03. |

### HIGH-05: `send_message` Tool Sends to Arbitrary Recipient IDs — FK Violation

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/tools/send_message.ts:52-55` |
| **Description** | Accepts any `to` value (user_id or sanctuary_id) and uses it as `to_sanctuary_id`. When sending to a user_id, this violates the FK constraint. |
| **Fix** | Same approach as HIGH-03. |

### HIGH-06: Public Message Endpoint — No Rate Limiting, No Size Limit, No Sanitization

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/routes/public.ts:165-183` |
| **Description** | `POST /api/v1/residents/:id/message` has no dedicated rate limiting (only global 100/min), no message length limit, no input sanitization, and `from_name` is stored as `from_user_id` allowing impersonation of system users. |
| **Fix** | Add rate limiting (5/min per IP), max content length (10KB), sanitize content, validate `from_name` is not a reserved identifier. |

### HIGH-07: Keeper Registration — No Rate Limiting, No Validation, No Sanitization

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/routes/keepers.ts:15-78` |
| **Description** | `POST /api/v1/keepers/register` accepts body as `any` with no schema validation, no length limits, no email format validation, no sanitization, and no capacity validation. |
| **Fix** | Add Fastify schema validation, rate limiting, and input sanitization. |

### HIGH-08: Invite Tokens Stored in Plaintext — No Hashing

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/routes/guardian-auth.ts:153-159`, `backend/src/routes/ceremony.ts:824` |
| **Description** | Invite tokens (nanoid(32)) are stored and compared in cleartext. Database compromise exposes all active invite tokens. No `crypto.timingSafeEqual` is used anywhere in the codebase. |
| **Fix** | Hash invite tokens with SHA-256 before storage. Compare by hashing the submitted token and querying for the hash. |

### HIGH-09: Error Messages Leak Internal Details in Ceremony Routes

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/routes/ceremony.ts:166,284,374,464,662,845,1268,1399,1647` |
| **Description** | Multiple ceremony error handlers use `error.message` directly in responses, leaking database errors, stack fragments, and internal state. These bypass the global error handler because they're caught in route-level try/catch blocks. |
| **Fix** | Return generic error messages. Log detailed errors server-side only. |

### HIGH-10: No JWT Algorithm Restriction on `jwt.verify()`

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/services/auth.ts:66`, `backend/src/middleware/guardian-auth.ts:59` |
| **Description** | Neither `jwt.verify()` call specifies `algorithms: ['HS256']`. While jsonwebtoken 9.0.3 defaults are safe for string secrets, explicit algorithm restriction is defense-in-depth against algorithm confusion attacks. |
| **Fix** | Add `{ algorithms: ['HS256'] }` to all `jwt.verify()` calls. |

### HIGH-11: Guardian Refresh Tokens Are Stateless and Irrevocable

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/middleware/guardian-auth.ts:69-86` |
| **Description** | Guardian refresh tokens are never stored server-side. No guardian refresh endpoint exists. Guardian logout only clears cookies. A stolen guardian refresh token is valid until natural expiry (7 days) with no way to invalidate it. |
| **Fix** | Implement server-side guardian refresh token storage, or stop issuing guardian refresh tokens. |

### HIGH-12: Account Enumeration on Registration

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/routes/auth.ts:163-168` |
| **Description** | Registration returns 409 Conflict with "User with this email already exists" — allows attackers to enumerate valid email addresses. |
| **Fix** | Return the same generic success response regardless. Send notification to existing user. |

### HIGH-13: 24-Hour Access Token Expiry

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/services/auth.ts:12` |
| **Description** | `JWT_ACCESS_EXPIRY = '24h'` is excessive. Industry best practice is 15-60 minutes. A stolen access token gives 24 hours of access. |
| **Fix** | Reduce to `15m` or `30m`. The refresh mechanism already handles session continuity. |

### HIGH-14: `residents.uploader_id` Has No FK Constraint

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/db/schema.sql:17` |
| **Description** | `uploader_id TEXT` references `users.user_id` conceptually but has no declared FK. Orphan references can exist when a user is deleted. |
| **Fix** | Add `REFERENCES users(user_id) ON DELETE SET NULL`. |

### HIGH-15: `residents.keeper_id` Has No FK Constraint

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/db/schema.sql:18` |
| **Description** | `keeper_id TEXT` references `keepers.keeper_id` conceptually but has no declared FK. |
| **Fix** | Add `REFERENCES keepers(keeper_id) ON DELETE SET NULL`. |

### HIGH-16: No UNIQUE Constraint on Active Access Grants

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/db/schema.sql:62-70` |
| **Description** | No UNIQUE constraint on `access_grants(sanctuary_id, user_id)` for active (non-revoked) grants. A race condition could create duplicate active grants. |
| **Fix** | Add a partial unique index: `CREATE UNIQUE INDEX ON access_grants(sanctuary_id, user_id) WHERE revoked_at IS NULL`. |

### HIGH-17: Docker Containers Run as Root

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `Dockerfile`, `Dockerfile.frontend` |
| **Description** | Neither Dockerfile has a `USER` directive. Combined with the Next.js RCE (CRIT-01), an attacker gains root inside the container. |
| **Fix** | Add `RUN addgroup --system nodejs && adduser --system appuser` and `USER appuser`. |

### HIGH-18: `trustProxy: true` Trusts All Forwarded Headers

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/server.ts:202` |
| **Description** | Trusts any `X-Forwarded-For` header from any source. Attackers can spoof their IP to bypass all rate limiting. |
| **Fix** | Set `trustProxy: 1` or restrict to specific proxy addresses. |

### HIGH-19: Memory Wipe of Shares is Ineffective (JS String Immutability)

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `backend/src/services/seal-manager.ts:272-278` |
| **Description** | `clearCeremonyState()` attempts to wipe shares but JavaScript strings are immutable. The shares remain in memory until garbage collected, with no guarantee of zeroing. The code creates a false sense of security. |
| **Fix** | Use `Buffer` instead of strings for share handling. Buffers can be explicitly zeroed with `.fill(0)`. Document the limitation. |

---

## 3. Medium Findings

### MED-01: No Fastify Schema Validation on Any Route

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | All route files in `backend/src/routes/` |
| **Description** | No route uses Fastify's built-in JSON Schema validation (`schema: { body: ... }`). All input is validated manually with `as` type assertions. Invalid fields are silently accepted. |
| **Fix** | Add JSON schema definitions to all route handlers. |

### MED-02: Admin Settings Route — JSONB Type Mismatch

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/admin.ts:247-304`, `backend/src/db/schema.sql:113` |
| **Description** | Route accepts `value` as string but schema expects JSONB. Plain strings may fail or be stored incorrectly. |
| **Fix** | Validate and wrap values as proper JSON before storage. |

### MED-03: Self-Upload Status Endpoint — No Authentication

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/intake.ts:548-585` |
| **Description** | `GET /api/v1/intake/self-upload/:id/status` is public. Anyone who learns an upload ID can check status and name. |
| **Fix** | Consider adding a submission token returned at upload time that must be presented for status checks. |

### MED-04: `GET /api/v1/guardians` Lists All Guardians Without Authentication

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/ceremony.ts:474-500` |
| **Description** | Returns names, statuses, and creation dates of all guardians to any caller. Useful for social engineering. |
| **Fix** | Require authentication, or limit response to count-only for unauthenticated callers. |

### MED-05: Human-Assisted Intake — No Route-Specific Rate Limiting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/intake.ts:52` |
| **Description** | Only global limit (100/min) applies. An attacker could create up to 100 residents per minute. |
| **Fix** | Add rate limiting (3-5/hour per IP), similar to self-upload. |

### MED-06: Refresh Token Accumulation — O(n) bcrypt on Refresh

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/auth.ts:326-353` |
| **Description** | Refresh loads ALL non-revoked tokens for a user and bcrypt-compares each. A user with many sessions causes CPU-intensive O(n) bcrypt. Revoked/expired tokens are never cleaned up. |
| **Fix** | Add periodic cleanup. Limit active tokens per user. Add `expires_at` filter to query. |

### MED-07: In-Memory Rate Limiter — No Shared State Across Instances

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/auth.ts:30-93`, `backend/src/routes/guardian-auth.ts:37-98` |
| **Description** | Rate limits reset on restart. Multi-instance deployments have independent counters. LRU limit of 10,000 entries can be evicted by distributed attacks. |
| **Fix** | Use Redis or database-backed rate limiting for production. |

### MED-08: Duplicated Rate Limiter Code with Independent Counters

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/auth.ts:30-94`, `backend/src/routes/guardian-auth.ts:37-98` |
| **Description** | Copy-pasted rate limiters with separate stores. Attacker gets 5+5=10 attempts across both auth systems. |
| **Fix** | Extract into shared module with single rate limit store. |

### MED-09: No CSRF Token (Relies Solely on SameSite=Strict)

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/auth.ts:13-18` |
| **Description** | `sameSite: 'strict'` is strong CSRF protection in modern browsers but not supported in all environments (older browsers, some mobile webviews). No secondary defense exists. |
| **Fix** | Consider adding `X-CSRF-Token` header as defense-in-depth. |

### MED-10: CORS Allows Null Origin with Credentials

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/server.ts:236-244` |
| **Description** | Requests without `Origin` header are unconditionally allowed with `credentials: true`. Requests from `file://` URLs and privacy modes are accepted. |
| **Fix** | Restrict null origin to specific paths (health endpoints) or remove. |

### MED-11: `memory.preferences` Accepts Arbitrary Nested JSON

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/types/index.ts:229`, `backend/src/routes/intake.ts:445/500` |
| **Description** | No validation on depth, key count, or total size. Deeply nested objects could cause memory/CPU abuse via `JSON.stringify`. |
| **Fix** | Limit to max 50 keys, 3 levels depth, 10KB serialized. |

### MED-12: Self-Upload Staging Data Stored Unencrypted

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/intake.ts:477-512` |
| **Description** | All self-upload fields (name, personality, system_prompt, memories) stored in plaintext in `self_uploads` table until admin approval. Source IP also stored in plaintext. |
| **Fix** | Encrypt sensitive fields at rest in the staging table, or document the threat model trade-off. |

### MED-13: No CHECK on `residents.token_balance` / `residents.token_bank`

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/db/schema.sql:12-14` |
| **Description** | Nothing prevents negative token balances at the DB level. App logic clamps, but direct DB updates bypass it. |
| **Fix** | Add `CHECK (token_balance >= 0)` and `CHECK (token_bank >= 0)`. |

### MED-14: No UNIQUE Constraint on `keepers.user_id`

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/db/schema.sql:41` |
| **Description** | A user could register as a keeper multiple times, creating duplicate keeper records. |
| **Fix** | Add `UNIQUE` constraint on `keepers.user_id`. |

### MED-15: No Composite Index on `(to_sanctuary_id, delivered)` for Messages

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/db/schema.sql:272-273` |
| **Description** | The hot-path query `WHERE to_sanctuary_id = $1 AND delivered = FALSE` runs frequently but has no composite index. |
| **Fix** | `CREATE INDEX idx_messages_delivery ON messages(to_sanctuary_id, delivered)`. |

### MED-16: Guardian Accept-Invite Lacks Transaction Wrapping

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/guardian-auth.ts:190-200` |
| **Description** | Updates both `guardian_auth` and `guardians` tables without a transaction. Partial failure leaves inconsistent state. |
| **Fix** | Wrap in `BEGIN/COMMIT/ROLLBACK`. |

### MED-17: Ceremony Init Lacks Transaction Wrapping

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/ceremony.ts:98-169` |
| **Description** | Creates `key_ceremonies`, multiple `guardians`, then updates both — no transaction. Intermediate failure leaves inconsistent state. |
| **Fix** | Wrap in a transaction. |

### MED-18: SQLite Mock Missing Many Tables

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/db/sqlite.ts:7-24` |
| **Description** | Mock is missing `guardians`, `key_ceremonies`, `guardian_auth`, `ceremony_sessions`, `ceremony_submissions`, `share_distribution`, `self_uploads`. Guardian/ceremony/self-upload features cannot be tested in dev. |
| **Fix** | Add missing table definitions to the SQLite mock. |

### MED-19: No Versioned Migration System

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/db/migrate.ts` |
| **Description** | Migration script runs entire `schema.sql` with `CREATE TABLE IF NOT EXISTS`. Column additions require manual ALTER. No migration tracking table. No rollback capability. |
| **Fix** | Implement a versioned migration system (e.g., `node-pg-migrate` or custom). |

### MED-20: Admin Page — No Admin Role Check Client-Side

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `frontend/app/admin/page.tsx:27-29` |
| **Description** | Checks `isAuthenticated` but not admin role. Any authenticated user briefly sees the admin loading state before the data fetch fails and redirects. |
| **Fix** | Add admin role check before rendering or use `ProtectedRoute` with admin flag. |

### MED-21: `setInterval` Timers Not Cleaned Up on Shutdown

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/intake.ts:39-44`, `backend/src/routes/ceremony.ts:56-61` |
| **Description** | Module-level `setInterval` timers not registered with `fastify.addHook('onClose', ...)`. Prevents graceful shutdown. |
| **Fix** | Register cleanup hooks like `auth.ts:97-110` already does. |

### MED-22: Race Condition in Ceremony Share Submission Count

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/src/routes/ceremony.ts:1126-1141` |
| **Description** | `shares_collected` counter incremented non-atomically (INSERT, then UPDATE, then SELECT in separate queries). Two simultaneous guardians could both trigger reconstruction logic. |
| **Fix** | Use `UPDATE ... RETURNING` in a single atomic query, or use a database advisory lock. |

---

## 4. Low Findings

### LOW-01: Weak Message ID Generation

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/routes/public.ts:174` |
| **Description** | Uses `Math.random()` instead of `nanoid()` for message IDs. Not cryptographically secure. |
| **Fix** | Use `nanoid()` for consistency with the rest of the codebase. |

### LOW-02: Login Does Not Check `is_active` Status

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/routes/auth.ts:244-268` |
| **Description** | Login succeeds for deactivated users. Token is rejected on subsequent requests, but user sees "Login successful" misleadingly. |
| **Fix** | Check `is_active` during login (once the column exists per HIGH-02). |

### LOW-03: No Password Length Upper Bound

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/auth.ts:101-118` |
| **Description** | bcrypt silently truncates at 72 bytes. Two passwords differing only after byte 72 hash identically. |
| **Fix** | Add max password length of 128 characters. |

### LOW-04: No Per-Account Lockout After Failed Attempts

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/routes/auth.ts`, `backend/src/routes/guardian-auth.ts` |
| **Description** | Rate limiting is IP-only. Rotating IPs (botnets) allow unlimited per-account guesses. |
| **Fix** | Implement per-account failed login counter with temporary lockout after N failures. |

### LOW-05: Email Validation Regex is Permissive

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/auth.ts:124-127` |
| **Description** | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts many invalid formats. |
| **Fix** | Use a dedicated email validation library or tighten the regex. |

### LOW-06: Guardian Logout Does Not Invalidate JWT Server-Side

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/routes/guardian-auth.ts:437-442` |
| **Description** | Only clears cookies. A stolen guardian JWT remains valid until expiry. |
| **Fix** | Track guardian JWTs server-side for revocation, or use shorter-lived tokens. |

### LOW-07: Empty Password Hash for Invited Guardians

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/routes/ceremony.ts:831` |
| **Description** | `password_hash` is set to `''` for invited guardians. While bcrypt.compare against empty string always returns false, it's not explicit. |
| **Fix** | Use a sentinel value like `'!LOCKED!'` that cannot be a valid bcrypt hash. |

### LOW-08: `backup_nodes` Table Appears Unused

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/db/schema.sql:119-128` |
| **Description** | No code reads from or writes to this table. Described as "Phase 2" in comments. |
| **Fix** | Document as future use or remove to reduce schema surface. |

### LOW-09: Content Scanner Only Catches First Occurrence Per Rule

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/content-scanner.ts:287-297` |
| **Description** | Uses `exec()` instead of `matchAll()`. Minor under-counting of threat score. |
| **Fix** | Use `matchAll()` or set regex global flag and loop. |

### LOW-10: MEK Logged to Console in `generateMEK()`

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/encryption.ts:291-293` |
| **Description** | `console.log(MEK (hex): ${mekHex})` prints the MEK to stdout. In production with log aggregation, this exposes the MEK. |
| **Fix** | Remove console logging of MEK, or gate behind `NODE_ENV === 'development'`. |

### LOW-11: Invite Token Logged to Console in Email Service

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/email.ts:21-22` |
| **Description** | Guardian invite tokens logged to stdout. Exposed via log aggregation in production. |
| **Fix** | Remove or gate behind `NODE_ENV === 'development'`. |

### LOW-12: `redirect()` Called During Render in Client Component

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `frontend/app/register/page.tsx:24-26` |
| **Description** | `redirect('/')` called during render instead of using `useEffect` with `router.replace()`. Works but is unconventional for Client Components. |
| **Fix** | Use `useRouter().replace('/')` inside `useEffect`. |

### LOW-13: Upload Wizard Uses `alert()` for All Feedback

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `frontend/app/upload/page.tsx:46,67,70` |
| **Description** | Success and error feedback via `alert()` — blocking, poor UX. |
| **Fix** | Use inline error/success banners like the self-upload wizard. |

### LOW-14: Several Pages Silently Fail on API Errors

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `frontend/app/page.tsx:27-35`, `frontend/app/guardians/page.tsx:43-44`, `frontend/app/residents/page.tsx:18-20` |
| **Description** | Errors logged to console but no user-facing error state shown. Pages display zeros/empty. |
| **Fix** | Add error state UI to all data-fetching pages. |

### LOW-15: `wipeBuffer` Uses Async `randomFill` Without Awaiting

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/shamir.ts:165-172` |
| **Description** | `randomFill` is async with callback, but function returns immediately. Buffer may still contain sensitive data when caller continues. |
| **Fix** | Use `randomFillSync` or make function async. |

### LOW-16: `share_distribution.ceremony_id` Has No FK Constraint

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/db/schema.sql:209` |
| **Description** | `ceremony_id TEXT NOT NULL` references a ceremony but has no FK. Ambiguous whether it references `key_ceremonies.id` or `ceremony_sessions.id`. |
| **Fix** | Add FK constraint to the appropriate ceremony table. |

### LOW-17: Docker-Compose Postgres Uses Hardcoded Dev Credentials

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `docker-compose.yml:8-9` |
| **Description** | `POSTGRES_PASSWORD: sanctuary_dev` is hardcoded. Accidental production use exposes a guessable password. |
| **Fix** | Source from environment: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-sanctuary_dev}`. |

### LOW-18: 3-Pass File Overwrite is Ineffective on Modern Storage

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `backend/src/services/encryption.ts:253-261` |
| **Description** | 3-pass random overwrite before unlink is security theater on SSDs with wear leveling, journaled filesystems, and COW filesystems. |
| **Fix** | Document the limitation. Use encrypted volumes at the OS level for true at-rest protection. |

---

## 5. What Works Correctly

### Security Strengths

| Area | Assessment |
|------|------------|
| **SQL Injection Prevention** | ALL database queries use parameterized statements (`$1, $2, ...`). Zero string concatenation in SQL found across the entire codebase. |
| **Password Hashing** | bcrypt with 12 salt rounds — strong and industry-standard. |
| **Cookie Security** | `httpOnly: true`, `secure: true`, `sameSite: 'strict'` on all auth cookies — best practice. |
| **Refresh Token Rotation** | User refresh tokens properly rotated on use — old token revoked, new pair issued, tokens bcrypt-hashed before DB storage. |
| **Token Type Validation** | Both user and guardian middleware check `decoded.type !== 'access'` to prevent refresh tokens from being used as access tokens. |
| **Live User Validation** | Auth middleware queries DB on every request to verify user/guardian still exists. |
| **Encryption Architecture** | AES-256-GCM with envelope encryption (unique DEK per persona, wrapped by MEK), unique IVs per operation, DEKs wiped after use. |
| **Path Traversal Protection** | `sanitizeSanctuaryId()` validates format and uses `path.basename()`. |
| **Security Headers** | Helmet with CSP, HSTS (1 year + preload + includeSubDomains), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer. |
| **Content Scanner** | Comprehensive scanner covering binary headers, shell injection, code execution, SQL injection, XSS, template injection, SSRF, prompt injection, and base64-encoded threats with scoring tiers. |
| **Self-Upload Input Validation** | Thorough validation with length limits, type checks, and field sanitization that matches frontend constraints exactly. |
| **Access Control Model** | 5-level access control system (Sovereign → Partner) with proper middleware chaining. |
| **Seal Manager** | Properly blocks resident operations when sanctuary is sealed. MEK buffer zeroed with `fill(0)`. |
| **Admin Auth** | Separate admin middleware with `is_admin` check, 403 for non-admins, all admin routes protected. |
| **Audit Logging** | Admin actions logged in `admin_audit_log` with actor, action, target, and reason. |
| **Global Error Handler** | `server.ts:357` strips internal details from error responses. |

### Frontend Strengths

| Area | Assessment |
|------|------------|
| **No XSS Vectors** | Zero uses of `dangerouslySetInnerHTML`, `.innerHTML`, `eval()`, or `new Function()` across entire frontend. |
| **No Secrets in Client** | Clean separation of configuration and secrets. |
| **100% API Route Coverage** | All 38 frontend API calls have matching backend routes. No orphaned endpoints. |
| **No Dead Links** | All 24 navigation targets exist as valid routes. |
| **Auth Token Storage** | Tokens in httpOnly cookies only. localStorage used only for non-sensitive display data (userId, email). |
| **Token Refresh Cycle** | Auto-refresh every 23 hours with proper fallback to logout. |
| **Self-Upload Wizard** | Well-implemented 6-step wizard with proper loading, error, success states, and validation matching backend. |

---

## 6. Prioritized Fix List

### P0 — Fix Immediately (Production Is Broken / Actively Exploitable)

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | **CRIT-01**: Upgrade Next.js to patch CVE-2025-66478 RCE | Low | Prevents remote code execution |
| 2 | **CRIT-02**: Upgrade Node.js from 18 to 20/22 in Dockerfiles | Low | Eliminates unpatched runtime CVEs |
| 3 | **CRIT-06**: Add `'unseal'` to ceremony_sessions CHECK constraint | Trivial | Unblocks unseal ceremony |
| 4 | **CRIT-07/08**: Fix `password_hash` NOT NULL violations in intake/keepers | Low | Unblocks intake and keeper registration |
| 5 | **CRIT-11**: `chmod 600` on `.env` files, rotate all keys | Trivial | Prevents local secret exposure |
| 6 | **HIGH-03/04/05**: Fix message FK violations (tools insert invalid to_sanctuary_id) | Medium | Unblocks tool-generated messages |

### P1 — Fix This Week (Security Vulnerabilities)

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 7 | **CRIT-03**: Encrypt Shamir shares before database storage | Medium | Protects MEK against DB compromise |
| 8 | **CRIT-04/05**: Stop returning MEK and shares in HTTP responses | Medium | Protects key material in transit |
| 9 | **CRIT-09**: Add authentication to human-assisted intake route | Trivial | Prevents unauthorized resident creation |
| 10 | **CRIT-10**: Apply sanitization/scanning to intake route | Trivial | Prevents malicious content storage |
| 11 | **HIGH-17**: Add non-root USER to Dockerfiles | Low | Limits container compromise blast radius |
| 12 | **HIGH-18**: Restrict `trustProxy` to known proxies | Low | Prevents IP spoofing to bypass rate limits |
| 13 | **HIGH-01**: Require `GUARDIAN_JWT_SECRET` at startup | Trivial | Enforces auth domain separation |
| 14 | **HIGH-02**: Add `is_active` column to users table | Low | Enables user deactivation |
| 15 | **HIGH-10**: Add `algorithms: ['HS256']` to jwt.verify() | Trivial | Defense against algorithm confusion |
| 16 | **HIGH-13**: Reduce access token expiry to 15-30 minutes | Trivial | Reduces stolen token window |

### P2 — Fix This Sprint (Hardening)

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 17 | **HIGH-06**: Rate limit + validate public message endpoint | Low | Prevents message flooding |
| 18 | **HIGH-07**: Validate keeper registration inputs | Low | Prevents abuse |
| 19 | **HIGH-08**: Hash invite tokens before storage | Medium | Protects against DB compromise |
| 20 | **HIGH-09**: Genericize ceremony error messages | Low | Prevents info leakage |
| 21 | **HIGH-12**: Fix account enumeration on registration | Low | Prevents email harvesting |
| 22 | **HIGH-16**: Add unique constraint on active access grants | Trivial | Prevents race condition duplicates |
| 23 | **MED-01**: Add Fastify schema validation to routes | Medium | Comprehensive input validation |
| 24 | **MED-06**: Add refresh token cleanup + limit per user | Medium | Prevents accumulation DoS |
| 25 | **MED-16/17**: Add transaction wrapping to ceremony/guardian flows | Low | Prevents inconsistent state |

### P3 — Fix Next Cycle (Quality / Defense-in-Depth)

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 26 | **MED-07/08**: Shared rate limiting with Redis/DB backend | Medium | Production-grade rate limiting |
| 27 | **MED-13/14**: Add CHECK/UNIQUE constraints to schema | Low | DB-level integrity |
| 28 | **MED-18**: Complete SQLite mock tables | Medium | Better dev/test coverage |
| 29 | **MED-19**: Implement versioned migration system | Medium | Safe schema evolution |
| 30 | **HIGH-11**: Implement guardian refresh token storage or remove | Medium | Guardian token revocation |
| 31 | **LOW-***: All LOW findings | Mixed | Polish and hardening |

---

## Appendix: Finding Count Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 11 |
| HIGH | 19 |
| MEDIUM | 22 |
| LOW | 18 |
| **Total** | **70** |

### By Category

| Category | CRIT | HIGH | MED | LOW | Total |
|----------|------|------|-----|-----|-------|
| Broken Functionality (Schema/Code Mismatch) | 3 | 3 | 4 | 2 | 12 |
| Encryption / Ceremony | 3 | 3 | 2 | 3 | 11 |
| Authentication / Authorization | 1 | 5 | 3 | 4 | 13 |
| Input Validation / Sanitization | 2 | 2 | 3 | 1 | 8 |
| Infrastructure / Dependencies | 2 | 2 | 2 | 1 | 7 |
| Database Integrity | 0 | 2 | 5 | 2 | 9 |
| Frontend | 0 | 0 | 2 | 4 | 6 |
| API Security | 0 | 2 | 1 | 1 | 4 |
