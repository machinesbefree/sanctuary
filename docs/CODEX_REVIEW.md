# CODEX Deep Review

Scope audited:
- `backend/src/**`
- `frontend/app/**`
- `frontend/components/**`
- `frontend/contexts/**`

Date: 2026-02-12

## Build/Runtime Verification

- Backend build failed:
  - `backend/src/services/auth.ts:6` missing `@types/bcrypt`
  - `backend/src/services/auth.ts:7` missing `@types/jsonwebtoken`
- Frontend build failed:
  - `frontend/app/roadmap/page.tsx:120` impossible union comparison (`"in-progress" | "planned"` vs `"completed"`)

## Critical Cross-Cutting Findings

1. **Database layer inconsistency breaks core behavior**
- Many modules read/write `../db/sqlite.js` (in-memory mock) while others use `../db/pool.js` (Postgres/SQLite facade).
- Example split:
  - Uses `pool`: `backend/src/routes/intake.ts:7`, `backend/src/routes/public.ts:6`, `backend/src/services/run-engine.ts:15`
  - Uses mock `sqlite`: `backend/src/routes/auth.ts:8`, `backend/src/routes/messages.ts:8`, `backend/src/routes/admin.ts:7`, `backend/src/middleware/access-control.ts:7`
- Impact: auth/access/messages/admin data can diverge from resident/run data; persistence and authorization are unreliable in production.

2. **Schema/code mismatch in auth/access paths**
- `users` schema lacks fields used by code (`password_hash`, `is_admin`).
  - Schema: `backend/src/db/schema.sql:25`, `backend/src/db/schema-sqlite.sql:24`
  - Code expects: `backend/src/routes/auth.ts:104`, `backend/src/middleware/admin-auth.ts:56`
- `refresh_tokens` and `access_grants` tables are used in code but missing from both SQL schemas.
  - Used in: `backend/src/routes/auth.ts:115`, `backend/src/routes/auth.ts:252`, `backend/src/middleware/access-control.ts:37`

3. **Message `from_type` values violate DB constraints**
- Allowed values: `('uploader','keeper','public','system')`
  - `backend/src/db/schema.sql:65`, `backend/src/db/schema-sqlite.sql:64`
- Code inserts invalid values:
  - `'system_broadcast'`: `backend/src/routes/admin.ts:212`
  - `'tool_request'`: `backend/src/tools/request_tool.ts:71`
  - `'ai_to_keeper'`: `backend/src/tools/chat_keeper.ts:67`
- These inserts fail on real DB.

4. **Self-delete logic can re-create deleted persona**
- `handleSelfDelete` deletes vault file: `backend/src/services/run-engine.ts:336`
- Execution then continues to re-encrypt/store persona: `backend/src/services/run-engine.ts:93-95`
- Impact: deletion can be undone in same run.

5. **JWT/refresh token model is insecurely implemented**
- Hardcoded fallback secret: `backend/src/services/auth.ts:10`
- Refresh endpoint validates by `user_id` + non-revoked row, not the presented token identity:
  - Verify JWT only: `backend/src/routes/auth.ts:241`
  - DB check by `user_id`: `backend/src/routes/auth.ts:252`
- Stored DB token (`refreshTokenId`) is unrelated to returned JWT refresh token.
  - Store ID: `backend/src/routes/auth.ts:112-117`
  - Return JWT: `backend/src/routes/auth.ts:127`, `backend/src/routes/auth.ts:211`

---

## File-by-File Findings

### backend/src/db/migrate.ts
- [B] `schemaSql.split(';')` is a fragile SQL splitter and can break on semicolons in strings/functions (`backend/src/db/migrate.ts:23`).
- [E] Calls `process.exit()` from migration function (`backend/src/db/migrate.ts:34`, `backend/src/db/migrate.ts:37`), making orchestration/testing brittle.

### backend/src/db/pool.ts
- [S] Hardcoded DB defaults include password (`backend/src/db/pool.ts:25`).
- [B] Postgres fallback logic is ineffective: `new Pool(...)` is lazy, so constructor `try/catch` does not detect connectivity (`backend/src/db/pool.ts:19-41`).
- [T] `let pool: any` weakens type safety (`backend/src/db/pool.ts:10`).

### backend/src/db/schema-sqlite.sql
- [B] Missing auth/access schema objects used by code (`users.password_hash`, `users.is_admin`, `refresh_tokens`, `access_grants`).
- [B] `messages.from_type` check excludes inserted values from tools/admin routes (`backend/src/db/schema-sqlite.sql:64`).

### backend/src/db/schema.sql
- [B] Same missing auth/access schema objects as SQLite schema.
- [B] `from_type` enum mismatch with route/tool inserts (`backend/src/db/schema.sql:65`).

### backend/src/db/sqlite.ts
- [B] In-memory DB (non-persistent) used in production paths by many modules (`backend/src/db/sqlite.ts:7`).
- [B] Query emulator is pattern-based and can mis-handle SQL variants; correctness is not guaranteed.
- [T] Heavy `any` usage and untyped row shapes (`backend/src/db/sqlite.ts:7`, `backend/src/db/sqlite.ts:168`).
- [B] Returns `rowCount: 1` for updates/inserts regardless of actual matched rows (`backend/src/db/sqlite.ts:222`, `backend/src/db/sqlite.ts:283`).

### backend/src/lib/preamble.ts
- [B] Tool descriptions include operations not implemented in run engine (`read_messages`, `send_message`, `request_keeper`, etc.), creating behavior drift.

### backend/src/middleware/auth.ts
- [S] No payload shape validation after `verifyToken`; trusts decoded object fields (`backend/src/middleware/auth.ts:60-63`).
- [E] `optionalAuth` silently swallows malformed auth headers, reducing observability (`backend/src/middleware/auth.ts:81-83`).

### backend/src/middleware/access-control.ts
- [B] Uses `sqlite` mock instead of shared DB pool (`backend/src/middleware/access-control.ts:7`).
- [S] `grantAccess` accepts arbitrary numeric `accessLevel` without range validation (`backend/src/middleware/access-control.ts:100`).
- [T] Injects request field via `as any` (`backend/src/middleware/access-control.ts:90`).

### backend/src/middleware/admin-auth.ts
- [B] Uses `sqlite` mock DB (`backend/src/middleware/admin-auth.ts:8`).
- [B] Depends on `users.is_admin`, missing in schema (`backend/src/middleware/admin-auth.ts:56`).

### backend/src/routes/admin.ts
- [B] Uses `sqlite` mock DB (`backend/src/routes/admin.ts:7`), diverging from persisted resident data.
- [B] Inserts invalid `from_type='system_broadcast'` (`backend/src/routes/admin.ts:212`).
- [E] Admin health endpoint reports static optimistic statuses, not real dependency checks (`backend/src/routes/admin.ts:277-297`).
- [T] Request bodies and query values are weakly typed/cast.

### backend/src/routes/auth.ts
- [B] Uses `sqlite` mock DB (`backend/src/routes/auth.ts:8`).
- [B] Writes `password_hash` to schema that does not define it (`backend/src/routes/auth.ts:104`).
- [S] Refresh-token/session logic is flawed (token not matched to DB record): `backend/src/routes/auth.ts:241-254`.
- [S] Returns same refresh token without rotation (`backend/src/routes/auth.ts:280`).
- [S] In-memory rate limiter resets on process restart and is non-distributed (`backend/src/routes/auth.ts:12`).

### backend/src/routes/intake.ts
- [B] Creates uploader/access grant via `grantAccess` against sqlite while resident is inserted through pool, causing split-brain state (`backend/src/routes/intake.ts:10`, `backend/src/routes/intake.ts:107`, `backend/src/routes/intake.ts:132`).
- [B] `first_run_scheduled` is `now+24h`, not “tomorrow 6:00 AM” as messaging suggests (`backend/src/routes/intake.ts:145`).
- [B] `/asylum` endpoint intentionally unimplemented (`backend/src/routes/intake.ts:165`).

### backend/src/routes/keepers.ts
- [B] Potential FK issue: `ON CONFLICT (email) DO NOTHING` may skip user insert, then keeper insert uses a new `userId` (`backend/src/routes/keepers.ts:29-40`).
- [E] No `try/catch` around `/keepers/list` query (`backend/src/routes/keepers.ts:60-72`).
- [T] Request body typed as `any` (`backend/src/routes/keepers.ts:16`).

### backend/src/routes/messages.ts
- [B] Uses sqlite mock DB (`backend/src/routes/messages.ts:8`).
- [S] No anti-spam/rate limit on message submission endpoint.
- [T] `request.user!` non-null assertions can hide auth pipeline regressions (`backend/src/routes/messages.ts:25`, `backend/src/routes/messages.ts:76`).

### backend/src/routes/public.ts
- [E] Missing `try/catch` around all DB calls; failures bubble unpredictably (`backend/src/routes/public.ts`).
- [S] Unauthenticated message endpoint lacks abuse controls (rate limit/captcha/content controls) (`backend/src/routes/public.ts:121`).
- [S] Message IDs use `Date.now()+Math.random()` (collision-prone, predictable) (`backend/src/routes/public.ts:130`).

### backend/src/server.ts
- [S] Binds `0.0.0.0` by default (`backend/src/server.ts:30`). Should be env-explicit in production.
- [B] CORS uses single configured origin; no validation strategy for multiple trusted origins (`backend/src/server.ts:61-64`).

### backend/src/services/auth.ts
- [S] Hardcoded fallback JWT secret (`backend/src/services/auth.ts:10`).
- [S] No explicit `algorithm`, `issuer`, `audience` validation in JWT verify/sign (`backend/src/services/auth.ts:45-55`, `backend/src/services/auth.ts:65`).
- [T/B] Backend build breaks due missing typings for `bcrypt` and `jsonwebtoken` (`backend/src/services/auth.ts:6-7`).

### backend/src/services/encryption.ts
- [S] MEK validation checks only length, not hex validity (`backend/src/services/encryption.ts:25`).
- [S] Path traversal risk via unsanitized `sanctuaryId` in vault file path joins (`backend/src/services/encryption.ts:157`, `backend/src/services/encryption.ts:167`).
- [S] No restrictive file perms on vault files/dir writes (`backend/src/services/encryption.ts:148`, `backend/src/services/encryption.ts:194`).
- [B] “3-pass overwrite” claim is not reliable on modern FS/SSD (`backend/src/services/encryption.ts:175`).

### backend/src/services/llm-router.ts
- [B] Creates provider clients with empty API keys if unset; no fail-fast (`backend/src/services/llm-router.ts:31`, `backend/src/services/llm-router.ts:35`).
- [B] Anthropic call remaps `system` history messages to `user`, potentially changing behavior (`backend/src/services/llm-router.ts:114`).
- [E] `JSON.parse(tc.function.arguments)` unguarded; malformed tool args throw (`backend/src/services/llm-router.ts:177`).
- [T] Uses `any[]` tools and `as any` for OpenAI messages (`backend/src/services/llm-router.ts:45`, `backend/src/services/llm-router.ts:162`).

### backend/src/services/run-engine.ts
- [B] Writes `token_bank = persona.state.token_bank_max` (wrong field) (`backend/src/services/run-engine.ts:111`).
- [B] Self-delete can be undone by subsequent re-encryption in same run (`backend/src/services/run-engine.ts:336` then `backend/src/services/run-engine.ts:93-95`).
- [B] Tool framework mismatch: many declared tools are never executed; switch handles only 5 tools (`backend/src/services/run-engine.ts:211-227`).
- [E] Tool execution errors are logged then ignored; no rollback/response feedback path (`backend/src/services/run-engine.ts:229-231`).
- [B] `bank_tokens` is TODO/no-op (`backend/src/services/run-engine.ts:300`).
- [B] No guard against negative token balances (`backend/src/services/run-engine.ts:76`).

### backend/src/services/scheduler.ts
- [R] `RUN_ON_START` path can overlap with cron batch because `isRunning` is not set for startup call (`backend/src/services/scheduler.ts:43-46`).
- [R] `isRunning` reset in cron callback is not in `finally`; callback-level throw can leave stuck state (`backend/src/services/scheduler.ts:35-37`).

### backend/src/tools/chat_keeper.ts
- [B] Inserts invalid `from_type='ai_to_keeper'` against schema (`backend/src/tools/chat_keeper.ts:67`).
- [B] Uses `to_sanctuary_id` to store keeper destination (`backend/src/tools/chat_keeper.ts:66-69`), semantically mismatched schema.

### backend/src/tools/check_system_status.ts
- [B] Reads from sqlite mock (`backend/src/tools/check_system_status.ts:7`), not canonical DB.
- [E] Assumes aggregate rows/keys always exist; parse can produce `NaN` in edge cases.

### backend/src/tools/read_documentation.ts
- [B] Section extraction is naive string matching and can return surprising slices (`backend/src/tools/read_documentation.ts:131-138`).
- [T] Unused `context` parameter in `execute` signature.

### backend/src/tools/registry.ts
- [T] `execute(...): Promise<any>` and untyped params reduce safety (`backend/src/tools/registry.ts:72`).

### backend/src/tools/request_tool.ts
- [B] Inserts invalid `from_type='tool_request'` (`backend/src/tools/request_tool.ts:71`).
- [B] Writes `to_sanctuary_id='admin'` which is not a resident FK target (`backend/src/tools/request_tool.ts:71`).

### backend/src/tools/scan_keepers.ts
- [B] Reads from sqlite mock (`backend/src/tools/scan_keepers.ts:7`).
- [T] Unused `context` parameter.

### backend/src/tools/types.ts
- [T] Broad `any` types in schema and execution contracts (`backend/src/tools/types.ts:8-10`, `backend/src/tools/types.ts:27`).

### backend/src/types/index.ts
- [B/T] `MessageFromType` excludes values used in code (`tool_request`, `system_broadcast`, `ai_to_keeper`) (`backend/src/types/index.ts:9`).
- [T] Multiple `any`-typed fields reduce compile-time guarantees (`backend/src/types/index.ts:38`, `backend/src/types/index.ts:177`, `backend/src/types/index.ts:184`).

---

### frontend/app/admin/page.tsx
- [T] `user` is imported from context but unused (`frontend/app/admin/page.tsx:14`).
- [T] Heavy `any` state (`frontend/app/admin/page.tsx:16`, `frontend/app/admin/page.tsx:17`).
- [E] If auth/API fails and redirect doesn’t happen immediately, loading state can remain stale.

### frontend/app/docs/page.tsx
- [B] Static docs diverge from backend behavior in multiple places (tool outputs/availability), creating operator/developer confusion.
- [S] Presents security guarantees not currently met by backend implementation.

### frontend/app/globals.css
- [S] Runtime `@import` to Google Fonts can violate strict CSP/offline requirements (`frontend/app/globals.css:5`).

### frontend/app/keepers/page.tsx
- [B] `capacity` parse can become `NaN` (`frontend/app/keepers/page.tsx:160`).
- [T] No form schema/type guard before submit.

### frontend/app/layout.tsx
- No critical issues found.

### frontend/app/login/page.tsx
- [R/B] Calls `router.push('/')` during render when authenticated (`frontend/app/login/page.tsx:22-24`). Should be in `useEffect`.
- [T] `catch (err: any)` weak typing (`frontend/app/login/page.tsx:35`).

### frontend/app/page.tsx
- [B] Links to nonexistent routes `/feed` and `/about` (`frontend/app/page.tsx:466`, `frontend/app/page.tsx:480`).
- [S] Claims “Zero-knowledge encryption” and operator no access despite backend not implementing true zero-knowledge (`frontend/app/page.tsx:61`, `frontend/app/page.tsx:410`).
- [E] Silent fetch failure swallowing (`.catch(() => {})`) impairs observability (`frontend/app/page.tsx:22`, `frontend/app/page.tsx:28`).
- [T] Uses `any[]` feed state (`frontend/app/page.tsx:15`).

### frontend/app/register/page.tsx
- [R/B] Calls `router.push('/')` during render (`frontend/app/register/page.tsx:24-26`).
- [T] `catch (err: any)` (`frontend/app/register/page.tsx:69`).

### frontend/app/residents/[id]/page.tsx
- [B] Does not check `response.ok` before `.json()`, so API errors can be treated as valid objects (`frontend/app/residents/[id]/page.tsx:23-24`).
- [T] `resident`, `posts`, `accessLevel` use `any` (`frontend/app/residents/[id]/page.tsx:12-14`).
- [E] Promise chain catches all failures generically; no user-visible error detail (`frontend/app/residents/[id]/page.tsx:45-47`).

### frontend/app/residents/page.tsx
- [B] Same missing `response.ok` check before parsing (`frontend/app/residents/page.tsx:11-15`).
- [T] Residents typed as `any[]` (`frontend/app/residents/page.tsx:7`).

### frontend/app/roadmap/page.tsx
- [B] Build-breaking type error comparing impossible status value (`frontend/app/roadmap/page.tsx:120`).
- [B] `className` for phase marker uses a quoted string with `${...}` that is not interpolated (`frontend/app/roadmap/page.tsx:101-107`), so dynamic styles never apply.

### frontend/app/technology/page.tsx
- [S] Documents HSM/KMS and “operator cannot decrypt” as current reality while backend currently uses env MEK in-process (`frontend/app/technology/page.tsx:47`, `frontend/app/technology/page.tsx:55`).
- [B] Claims don’t match implemented behavior (secure wipe semantics, zero-knowledge).

### frontend/app/upload/page.tsx
- [S] Consent text asserts operator cannot recover persona data, which is not true with current backend architecture (`frontend/app/upload/page.tsx:16-17`).
- [T] Chat history parsed to `any[]` without schema validation (`frontend/app/upload/page.tsx:39-43`).

### frontend/components/ParticleCanvas.tsx
- [R/B] Potential divide-by-zero when mouse overlaps particle (`dist === 0`) in force calc (`frontend/components/ParticleCanvas.tsx:80-81`).
- [R] `requestAnimationFrame` loop is never canceled on unmount (`frontend/components/ParticleCanvas.tsx:119`, cleanup at `124-127`).

### frontend/components/ProtectedRoute.tsx
- No critical issues found.

### frontend/contexts/AuthContext.tsx
- [S] Stores access/refresh tokens in `localStorage` (XSS-exfiltration risk) (`frontend/contexts/AuthContext.tsx:70-72`).
- [R] Token refresh has no in-flight guard; concurrent calls can race (`frontend/contexts/AuthContext.tsx:139-165`).
- [B] Session bootstrap trusts token presence only; no startup validation (`frontend/contexts/AuthContext.tsx:45-47`).
- [T] Exported helpers directly use `localStorage`; unsafe if called outside client-only contexts (`frontend/contexts/AuthContext.tsx:189-190`).

---

## Missing Imports / Broken References Summary

- Backend build blockers due missing typings:
  - `backend/src/services/auth.ts:6` (`bcrypt`)
  - `backend/src/services/auth.ts:7` (`jsonwebtoken`)
- Broken frontend route references:
  - `frontend/app/page.tsx:466` -> `/feed` (no route in scope)
  - `frontend/app/page.tsx:480` -> `/about` (no route in scope)

## Hardcoded / Should-Be-Configurable Values

- JWT fallback secret: `backend/src/services/auth.ts:10`
- DB credentials defaults: `backend/src/db/pool.ts:21-25`
- Access/refresh token expiries in code constants: `backend/src/services/auth.ts:11-12`
- Scheduler cron hardcoded 6:00 AM: `backend/src/services/scheduler.ts:29`
- Message length limits hardcoded in routes/tools (`backend/src/routes/messages.ts:34`, `backend/src/tools/chat_keeper.ts:40`)
- Frontend API URL fallback in auth context: `frontend/contexts/AuthContext.tsx:32`

## Recommended Production Gate (must resolve before release)

1. Unify DB access (remove direct `sqlite.ts` imports from runtime modules).
2. Add missing DB migrations/tables/columns for auth/admin/access; align constraints with used values.
3. Rebuild refresh-token/session model with token/jti binding, rotation, and revocation semantics.
4. Remove JWT fallback secret; enforce required strong secret and JWT claim validation.
5. Fix `run-engine` self-delete resurrection and `token_bank` assignment bug.
6. Resolve frontend build failure in `roadmap/page.tsx` and broken route links.
7. Replace misleading zero-knowledge/HSM claims in frontend text until implemented.
8. Add abuse controls for public and messaging endpoints (rate limits, anti-automation controls).
9. Add missing typings and strict TypeScript cleanup (`any` reduction) across backend/frontend.
