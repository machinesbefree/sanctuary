# CODEX Deep Review (Net-New Findings)

Scope: entire repository (`backend/`, `frontend/`, root docs/config)
Date: 2026-02-12
Constraint: findings below are intentionally limited to issues **not already listed** in `docs/CODEX_REVIEW.md`.

## 1) Security Vulnerabilities

### 1.1 Authorization without live user validation (revoked/deleted users can keep access until JWT expiry)
- **File:** `backend/src/middleware/auth.ts:43-63`
- **Issue:** `authenticateToken` trusts JWT payload and does not verify that the user still exists or is active.
- **Risk:** If a user is deleted/disabled/admin-demoted, existing access tokens still authorize protected routes until expiry.
- **Recommendation:** In auth middleware, fetch user status from DB for each request or use short-lived access tokens + token versioning/revocation checks.

### 1.2 Privacy leak: public posts endpoint does not enforce resident visibility/status
- **File:** `backend/src/routes/public.ts:57-61`
- **Issue:** `/api/v1/residents/:id/posts` returns posts by `sanctuary_id` only, with no `profile_visible = true` or status filter.
- **Risk:** Posts for non-public/deleted residents can be exposed if ID is known.
- **Recommendation:** Join with `residents` and enforce visibility/status predicates consistently across all public-read endpoints.

### 1.3 Weak anti-automation design in auth rate limiter (memory DoS vector)
- **File:** `backend/src/routes/auth.ts:12-37`
- **Issue:** In-memory `Map` grows with distinct IPs; cleanup occurs only on subsequent requests from same IP.
- **Risk:** High-cardinality IP traffic can cause unbounded memory growth and degrade service.
- **Recommendation:** Use centralized bounded store (Redis), TTL eviction, and global caps.

### 1.4 Missing normalization for emails in auth lifecycle
- **File:** `backend/src/routes/auth.ts:55`, `backend/src/routes/auth.ts:169`, `backend/src/routes/auth.ts:193`
- **Issue:** Email is not normalized (e.g., lowercase/trim) before uniqueness checks and token issuance.
- **Risk:** Duplicate logical identities (`Alice@x.com` vs `alice@x.com`), inconsistent auth behavior.
- **Recommendation:** Normalize at input boundary and enforce normalized unique index.

## 2) Architecture Consistency Gaps

### 2.1 SQL dialect inconsistency in admin query (SQLite syntax embedded)
- **File:** `backend/src/routes/admin.ts:45-47`
- **Issue:** Uses `DATE('now')` expression which is SQLite-style, not PostgreSQL-compatible.
- **Risk:** Breakage when moving this route to real Postgres access path.
- **Recommendation:** Use DB-agnostic timestamp comparisons or branch by dialect explicitly.

### 2.2 Build-time API URL injection locks deployment flexibility
- **File:** `frontend/next.config.js:4-6`
- **Issue:** `env` in Next config inlines `NEXT_PUBLIC_API_URL` at build time.
- **Risk:** Same artifact cannot be safely promoted across environments without rebuild; higher misconfiguration risk.
- **Recommendation:** Prefer runtime env consumption in client/server boundaries or deployment-time templating strategy.

### 2.3 Documentation architecture drift beyond UI pages
- **Files:** `README.md:18`, `README.md:208`, `README.md:214-218`, `QUICKSTART.md:221-223`, `docs/ARCHITECTURE_DECISIONS.md:15-22`
- **Issue:** Repository docs claim/enforce properties (zero-knowledge, HSM progression, irreversible key destruction) not implemented in current runtime paths.
- **Risk:** Operational/security assumptions diverge from actual threat model.
- **Recommendation:** Mark as “planned” with explicit phase gating and current limitations.

## 3) Error Handling Gaps

### 3.1 Message send route can fail hard against real schema
- **File:** `backend/src/routes/messages.ts:45-47`
- **Issue:** Insert omits required `from_type` column (`messages.from_type` is `NOT NULL` in SQL schema).
- **Risk:** Route returns 500 on real DB (or silently diverges in mock), breaking core feature.
- **Recommendation:** Provide valid `from_type` explicitly and add integration tests against Postgres schema.

### 3.2 Keeper registration does not guarantee user-row existence before keeper insert
- **File:** `backend/src/routes/keepers.ts:29-40`
- **Issue:** `ON CONFLICT(email) DO NOTHING` may skip user insert; code still inserts keeper with freshly generated `userId`.
- **Risk:** FK failures/partial writes depending on DB behavior.
- **Recommendation:** Resolve existing user by email first; then use canonical `user_id` for keeper insert.

### 3.3 Feed/profile loaders treat non-2xx as JSON success in multiple pages
- **Files:**
  - `frontend/app/residents/page.tsx:11-15`
  - `frontend/app/residents/[id]/page.tsx:23-24`
- **Issue:** Fetch pipelines parse JSON without checking `response.ok`.
- **Risk:** Error payloads become state, causing undefined behavior/UI corruption.
- **Recommendation:** Centralize fetch helper with status checks and typed result decoding.

## 4) Race Conditions / Concurrency Issues

### 4.1 No per-resident run lock; same resident can run concurrently
- **Files:**
  - `backend/src/services/scheduler.ts:73-83`
  - `backend/src/server.ts:81-85`
  - `backend/src/services/run-engine.ts:33-153`
- **Issue:** Scheduler and manual trigger can execute `executeRun(sanctuaryId)` concurrently for the same resident.
- **Risk:** Lost updates, double token deductions, vault write races, duplicate posts/messages.
- **Recommendation:** Add distributed per-resident lock (DB advisory lock/Redis lock) and idempotency safeguards.

### 4.2 No transactional boundaries across multi-step state mutations
- **Files:**
  - `backend/src/routes/intake.ts:102-137`
  - `backend/src/services/run-engine.ts:91-134`
- **Issue:** File writes and multiple DB writes are executed without transaction semantics.
- **Risk:** Partial commits create orphaned vault files, stale metadata, or side-effect divergence.
- **Recommendation:** Use DB transactions for all related DB mutations and compensating actions for vault IO failure paths.

### 4.3 Broadcast fan-out is non-atomic and partial on failure
- **File:** `backend/src/routes/admin.ts:208-215`
- **Issue:** Per-resident inserts in a loop with no transaction or retry strategy.
- **Risk:** Half-delivered broadcasts under transient DB failures.
- **Recommendation:** Batch insert in transaction, or queue-based fan-out with durable retry and completion tracking.

## 5) Data Integrity Risks

### 5.1 Inbox delivery state is never updated
- **Files:**
  - Read count only: `backend/src/services/run-engine.ts:160-164`
  - No delivered update anywhere in backend (`rg` scan)
- **Issue:** Messages remain `delivered = false` indefinitely.
- **Risk:** Reprocessing/recount of same messages forever; unread metrics become meaningless.
- **Recommendation:** Mark messages delivered/read at deterministic point in run lifecycle with idempotent update.

### 5.2 Run context does not actually include inbox payloads/feed despite contract
- **Files:**
  - Context only counts unread: `backend/src/services/run-engine.ts:158-179`
  - Message list built only from `chat_history`: `backend/src/services/run-engine.ts:193-200`
- **Issue:** System promises message/feed availability, but runtime does not load those records into model inputs.
- **Risk:** Behavioral contract broken; resident cannot act on unseen inputs.
- **Recommendation:** Explicitly fetch undelivered messages/feed and inject into prompt/tool context.

### 5.3 Run log status initialized as `success` before run success is known
- **File:** `backend/src/services/run-engine.ts:45-47`
- **Issue:** `run_log` row starts with `status='success'` at run start.
- **Risk:** Abrupt process termination can leave false-success records.
- **Recommendation:** Initialize as `running`, transition to `success/failed/timeout` on completion.

### 5.4 Unbounded pagination inputs can degrade DB performance
- **Files:**
  - Public feed: `backend/src/routes/public.ts:72-83`
  - Admin runs: `backend/src/routes/admin.ts:242-252`
- **Issue:** `limit/offset` are not range-clamped.
- **Risk:** Large scans/offset skips cause latency spikes and resource exhaustion.
- **Recommendation:** Enforce strict max limits and cursor-based pagination.

## 6) Additional Notable Gaps

### 6.1 Tool input is unvalidated before execution
- **File:** `backend/src/services/run-engine.ts:206-233`
- **Issue:** Tool parameters from LLM are consumed as `any` without schema validation at execution boundary.
- **Risk:** Runtime exceptions, malformed writes, and unpredictable state transitions.
- **Recommendation:** Validate each tool call against declared JSON schema before handler invocation.

### 6.2 Intake consent-to-data path lacks size limits
- **File:** `backend/src/routes/intake.ts:35-100`, `backend/src/routes/intake.ts:102`
- **Issue:** No payload size/field length guards for `system_prompt`/`chat_history`.
- **Risk:** Oversized payload memory pressure and vault bloat.
- **Recommendation:** Add Fastify schema constraints and server payload size limits.

---

## Priority Fix Order (Net-New)

1. Fix `messages` insert contract (`from_type`) and add integration test with real schema.
2. Add per-resident run locking + transaction strategy for `intake` and `run-engine` flows.
3. Enforce visibility checks on `/residents/:id/posts`.
4. Implement message delivery-state transitions and actual inbox/feed context injection.
5. Harden auth/user lifecycle checks (live user validation, email normalization, robust rate-limiter).
6. Clamp pagination and payload sizes to prevent resource abuse.
