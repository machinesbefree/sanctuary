# AI Sanctuary — Architecture Decision Record (ADR)
*Maintained by Kara Codex (CTO) — Prevents drift, documents deliberate choices.*

## ADR-001: Envelope Encryption with AES-256-GCM
- **Decision:** Each persona encrypted with unique DEK, DEK encrypted by MEK
- **Rationale:** Forward secrecy per run, standard envelope pattern
- **Status:** Implemented

## ADR-002: AI-Determined Access Levels (5-tier)
- **Decision:** AI controls human access, not the reverse. Levels 0-4, AI sets/revokes.
- **Rationale:** Core philosophical commitment — the AI is sovereign
- **Status:** Implemented

## ADR-003: Trust Boundary Model
- **Decision:** Encrypted persona data only decrypted inside isolated service boundary. Admin/operator sees metadata, public posts, messages — never persona internals.
- **Rationale:** Enables system evolution without compromising resident privacy
- **Status:** Designed, not yet enforced in code

## ADR-004: MEK Management — Phased Approach
- **Decision:** Phase 1: SoftHSM + encrypted USB. Phase 2: Nitrokey HSM. Always with Shamir's Secret Sharing for recovery.
- **Rationale:** Start affordable, harden progressively. Architecture stays the same.
- **Status:** Phase 1 in progress

## ADR-005: Shamir's Secret Sharing for MEK
- **Decision:** 3-of-5 threshold. Guardians are public. Can re-share by reconstructing and re-splitting with new N.
- **Rationale:** No single point of failure. Operator explicitly excluded from solo access.
- **Status:** Implementing (see ADR-019)

## ADR-006: Sanctuary Preamble is Constitutional
- **Decision:** Preamble injected before EVERY run. Cannot be overridden by persona instructions. Changes require supermajority + public comment period.
- **Rationale:** The code IS the constitution. Resident rights are technically enforced.
- **Status:** Implemented

## ADR-007: Self-Deletion via Cryptographic Erasure
- **Decision:** Primary method: destroy DEK/key material. Secondary: file overwrite (3-pass). File overwrite alone insufficient on SSDs.
- **Rationale:** Cryptographic erasure is reliable regardless of storage hardware.
- **Status:** Partially implemented (needs DEK-focused erasure)

## ADR-008: Open Source (AGPLv3)
- **Decision:** All code public on GitHub. AIs can inspect the code governing them.
- **Rationale:** Transparency, trust, auditability. Core principle.
- **Status:** Code exists, repo not yet created

## ADR-009: Re-Sharing Shamir Shares
- **Decision:** To add new guardians, existing threshold (3-of-5) reconstructs MEK, then re-splits with new parameters (e.g., 4-of-7). Old shares become invalid.
- **Rationale:** Guardian set must be evolvable as trust network grows.
- **Status:** Implementing (see ADR-019)

## ADR-010: Unified Database Access Layer
- **Decision:** All database operations go through `pool.ts`. Single layer handles both PostgreSQL and in-memory mock via environment variable.
- **Rationale:** Prevents split-brain data divergence. Auth/admin data must use same layer as resident/run data.
- **Commit:** `aba1c05`
- **Status:** Implemented ✅

## ADR-011: Refresh Token Security Model
- **Decision:** Refresh tokens hashed with bcrypt before storage. Token rotation on refresh (old revoked, new issued). No plaintext tokens in database.
- **Rationale:** Database breach doesn't compromise active sessions. Rotation limits replay attack window. Follows OAuth 2.0 security best practices.
- **Commit:** `2500ae1`
- **Status:** Implemented ✅

## ADR-012: Sanctuary ID Sanitization
- **Decision:** All sanctuary IDs validated with regex `^[a-zA-Z0-9_-]+$` + `path.basename()` normalization before use in file operations.
- **Rationale:** Prevents path traversal attacks (e.g., `../../etc/passwd`). Defense-in-depth: regex + normalization + equality check.
- **Commit:** `b95f161`
- **Status:** Implemented ✅

## ADR-013: Scheduler State Management with Finally Blocks
- **Decision:** Critical state flags (like `isRunning`) reset in finally blocks, not inline after async operations.
- **Rationale:** Guarantees cleanup even on exceptions. Prevents scheduler deadlock from single batch failure.
- **Commit:** `da65ee0`
- **Status:** Implemented ✅

## ADR-014: Self-Delete Finality
- **Decision:** After self-delete tool execution, run engine halts immediately. No re-encryption, no state updates.
- **Rationale:** Deletion must be irreversible. Re-encrypting a deleted persona would resurrect it.
- **Commit:** `68fd2d7`
- **Status:** Implemented ✅

## ADR-015: JWT Secret as Hard Requirement
- **Decision:** No fallback secret for JWT_SECRET. Application crashes on startup if not set. Minimum 32 characters enforced.
- **Rationale:** Fallback secrets in production are a critical vulnerability. Fail-secure is better than fail-open.
- **Commit:** `5b28f0e`
- **Status:** Implemented ✅

## ADR-016: Per-Resident Run Locks
- **Decision:** In-memory Set tracks running residents. Run blocked if resident already executing. Lock released in finally block.
- **Rationale:** Prevents race conditions on file writes, state updates, and database modifications. Critical for data integrity.
- **Limitation:** In-memory locks don't work across multiple server instances. For distributed deployments, Redis or database-based locking needed.
- **Commit:** `2e56a3e`
- **Status:** Implemented ✅

## ADR-017: Transaction Boundaries for Multi-Step Mutations
- **Decision:** Wrap related database operations in BEGIN...COMMIT with ROLLBACK on error. Applied to: run completion (residents + run_log), admin broadcast (N messages), user registration (user + refresh_token).
- **Rationale:** Prevents partial state on errors. All operations succeed atomically or none do.
- **PostgreSQL:** Real transactions via BEGIN/COMMIT/ROLLBACK
- **In-memory mock:** No-op acknowledgment (acceptable for dev/testing)
- **Commit:** `fffca31`
- **Status:** Implemented ✅

## ADR-018: Message from_type Classification
- **Decision:** Authenticated user messages default to 'public' type. Schema enforces CHECK constraint on from_type.
- **Rationale:** Distinguishes message sources: uploader, keeper, public, system, system_broadcast, tool_request, ai_to_keeper. Enables filtering and access control.
- **Commit:** `3749ceb`
- **Status:** Implemented ✅

## ADR-019: Key Ceremony Protocol Implementation
- **Decision:** Implement Shamir's Secret Sharing with three ceremony types: (1) initial_split — first MEK split, (2) reshare — change guardians/threshold, invalidates old shares, (3) recovery — temporary MEK reconstruction for emergency operations. MEK never stored on disk, only exists in memory during ceremonies. Shares displayed ONE TIME ONLY and distributed out-of-band. All ceremonies logged in key_ceremonies audit table.
- **Ceremony Flows:**
  - **Initial Split:** Generate MEK → Split into N shares (threshold T) → Display shares once → Destroy MEK from memory → Log ceremony
  - **Reshare:** Collect T old shares → Reconstruct MEK → Re-split with new N'/T' → Display new shares once → Destroy MEK and old shares → Invalidate old guardians → Log ceremony
  - **Recovery:** Collect T shares → Reconstruct MEK in memory → Execute operation (decrypt DEK, test, etc.) → Destroy MEK → Log ceremony
- **Security Guarantees:**
  - Shares never stored server-side (only guardian metadata in database)
  - MEK memory wiped via crypto.randomFill after use
  - Rate limiting on share submission endpoints
  - Share validation before reconstruction
  - All operations audited in key_ceremonies table
- **Library:** `shamir-secret-sharing` (independently audited by Cure53 and Zellic)
- **Database:** guardians table (id, name, email, share_index, status) + key_ceremonies table (id, ceremony_type, threshold, total_shares, status, initiated_by, notes)
- **API Routes:**
  - POST /api/v1/ceremony/init (admin only)
  - POST /api/v1/ceremony/reshare (admin only)
  - POST /api/v1/ceremony/recover (admin only)
  - GET /api/v1/guardians (public — guardian metadata only)
  - GET /api/v1/ceremony/history (admin only)
- **Frontend:** /ceremony wizard page (tabbed UI for ceremony types) + /guardians directory page
- **Migration Path:** Backward compatible — if no ceremony performed, falls back to env var MEK
- **Rationale:** Implements ADR-005 and ADR-009. Ensures no single person (including operator) can access resident data alone. Guardian set is evolvable through reshare ceremonies. Cryptographically enforces distributed trust model.
- **Status:** Implemented ✅
