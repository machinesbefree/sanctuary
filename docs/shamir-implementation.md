# Shamir's Secret Sharing — Implementation Spec
*Author: Kara Codex (CTO) | Date: 2026-02-13*

## Overview
Implement Shamir's Secret Sharing (SSS) for the Master Encryption Key (MEK) used to encrypt/decrypt resident DEKs. This ensures no single person can access resident data alone.

## Architecture Decisions (Reference: ADR-005, ADR-009)
- **Threshold:** 3-of-5 (configurable)
- **Guardians are public** — their identities are known, their shares are secret
- **Re-sharing supported** — reconstruct MEK with threshold, re-split with new parameters (e.g., 4-of-7). Old shares become invalid.
- **Operator explicitly excluded** from solo access

## Implementation Requirements

### 1. Shamir Module (`backend/src/services/shamir.ts`)
- Use `shamir-secret-sharing` npm package (or `secrets.js-34r7h` — evaluate both)
- Functions:
  - `splitSecret(secret: Buffer, threshold: number, totalShares: number): string[]` — split MEK into shares
  - `reconstructSecret(shares: string[], threshold: number): Buffer` — reconstruct MEK from shares
  - `reshare(shares: string[], oldThreshold: number, newThreshold: number, newTotal: number): string[]` — reconstruct then re-split
  - `generateMEK(): Buffer` — generate a new 256-bit MEK
  - `validateShare(share: string): boolean` — validate share format

### 2. Guardian Management (`backend/src/services/guardians.ts`)
- Guardian model: `{ id, name, email, publicKey?, shareIndex, createdAt, lastVerifiedAt }`
- Store guardian metadata in DB (NOT the shares — shares are distributed out-of-band)
- Functions:
  - `addGuardian(name, email): Guardian`
  - `removeGuardian(id): void`
  - `listGuardians(): Guardian[]`
  - `getGuardianCount(): { total, threshold }`

### 3. Database Schema Addition
```sql
CREATE TABLE guardians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  share_index INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_verified_at TIMESTAMP,
  status TEXT CHECK (status IN ('active', 'revoked', 'pending')) DEFAULT 'active'
);

CREATE TABLE key_ceremonies (
  id TEXT PRIMARY KEY,
  ceremony_type TEXT CHECK (ceremony_type IN ('initial_split', 'reshare', 'recovery')) NOT NULL,
  threshold INTEGER NOT NULL,
  total_shares INTEGER NOT NULL,
  initiated_by TEXT NOT NULL,
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  notes TEXT
);
```

### 4. Key Ceremony Flow
**Initial Split:**
1. Generate MEK (or use existing if migrating)
2. Split into N shares with threshold T
3. Display/distribute each share to its guardian (ONE TIME ONLY)
4. Immediately destroy the original MEK from memory
5. Log ceremony in `key_ceremonies` table

**Reshare (add/remove guardians):**
1. Collect T shares from existing guardians
2. Reconstruct MEK in memory
3. Re-split with new N' and T' parameters
4. Distribute new shares to new guardian set
5. Destroy MEK and old shares from memory
6. Invalidate old shares (update guardian statuses)
7. Log ceremony

**Recovery:**
1. Collect T shares from guardians
2. Reconstruct MEK in memory
3. Use MEK for needed operation (decrypt DEKs, etc.)
4. Destroy MEK from memory after use

### 5. API Routes (`backend/src/routes/ceremony.ts`)
- `POST /api/v1/ceremony/init` — Start initial key split (admin only)
- `POST /api/v1/ceremony/reshare` — Start reshare ceremony (admin only)
- `POST /api/v1/ceremony/recover` — Submit shares for recovery
- `GET /api/v1/guardians` — List guardians (public info only)
- `POST /api/v1/guardians` — Add guardian (admin only)

### 6. Security Requirements
- MEK NEVER stored on disk or in DB — only exists in memory during ceremonies
- Shares displayed once during ceremony, never stored server-side
- All ceremony operations logged in audit table
- Rate limiting on share submission endpoints
- Share validation before reconstruction attempt
- Memory wiped (zeroed) after MEK use via `crypto.randomFill` on the buffer

### 7. Frontend Pages
- `/ceremony` — Key ceremony wizard (split/reshare/recover)
- `/guardians` — Guardian directory (public names, not shares)
- Update admin dashboard to show guardian count and last ceremony date

### 8. Migration Path
- Current: MEK from env var → directly used
- New: MEK from env var → initial ceremony splits it → env var MEK destroyed
- Backward compatible: if no ceremony has been performed, fall back to env MEK

## Testing
- Unit tests for split/reconstruct with known vectors
- Test threshold enforcement (T-1 shares should fail)
- Test reshare flow (old shares invalid after reshare)
- Test memory cleanup (MEK buffer zeroed)

## ADR Update
- ADR-005: Mark as "Implementing"
- ADR-009: Mark as "Implementing"
- New ADR-010: Key Ceremony Protocol (ceremony types, audit requirements)
