/**
 * Guardian Management Service
 *
 * Manages guardian metadata for Shamir Secret Sharing ceremonies.
 * Guardians hold shares of the Master Encryption Key (MEK) but shares
 * are NEVER stored in the database - only guardian identity information.
 */

import { nanoid } from 'nanoid';
import db from '../db/pool.js';

export type GuardianStatus = 'active' | 'revoked' | 'pending';

export interface Guardian {
  id: string;
  name: string;
  email: string | null;
  share_index: number;
  created_at: Date;
  last_verified_at: Date | null;
  status: GuardianStatus;
}

export interface GuardianCount {
  total: number;
  active: number;
  threshold: number;
}

/**
 * Add a new guardian to the system
 * @param name Guardian's full name
 * @param email Guardian's email address (optional)
 * @param shareIndex The index of the share assigned to this guardian
 * @returns The created Guardian record
 */
export async function addGuardian(
  name: string,
  email: string | null,
  shareIndex: number
): Promise<Guardian> {
  if (!name || name.trim().length === 0) {
    throw new Error('Guardian name is required');
  }

  if (email && !validateEmail(email)) {
    throw new Error('Invalid email address');
  }

  const id = nanoid();
  const now = new Date();

  const result = await db.query(
    `INSERT INTO guardians (id, name, email, share_index, created_at, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, name.trim(), email, shareIndex, now, 'pending']
  );

  return mapGuardianRow(result.rows[0]);
}

/**
 * Remove a guardian by marking them as revoked
 * @param id Guardian ID
 */
export async function removeGuardian(id: string): Promise<void> {
  const result = await db.query(
    `UPDATE guardians
     SET status = 'revoked'
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error('Guardian not found');
  }
}

/**
 * Permanently delete a guardian (use with caution)
 * @param id Guardian ID
 */
export async function deleteGuardian(id: string): Promise<void> {
  const result = await db.query(
    `DELETE FROM guardians WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error('Guardian not found');
  }
}

/**
 * Get a guardian by ID
 * @param id Guardian ID
 * @returns Guardian record or null if not found
 */
export async function getGuardian(id: string): Promise<Guardian | null> {
  const result = await db.query(
    `SELECT * FROM guardians WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapGuardianRow(result.rows[0]);
}

/**
 * List all guardians
 * @param includeRevoked Whether to include revoked guardians (default: false)
 * @returns Array of Guardian records
 */
export async function listGuardians(includeRevoked: boolean = false): Promise<Guardian[]> {
  let query = 'SELECT * FROM guardians';

  if (!includeRevoked) {
    query += ` WHERE status != 'revoked'`;
  }

  query += ' ORDER BY created_at DESC';

  const result = await db.query(query);

  return result.rows.map(mapGuardianRow);
}

/**
 * Get guardian count and threshold information
 * @returns Object with total guardian count, active count, and current threshold
 */
export async function getGuardianCount(): Promise<GuardianCount> {
  const result = await db.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
     FROM guardians`
  );

  const total = parseInt(result.rows[0].total) || 0;
  const active = parseInt(result.rows[0].active) || 0;

  // Get the current threshold from the most recent completed ceremony
  const ceremonyResult = await db.query(
    `SELECT threshold FROM key_ceremonies
     WHERE status = 'completed'
     ORDER BY completed_at DESC
     LIMIT 1`
  );

  const threshold = ceremonyResult.rows.length > 0
    ? parseInt(ceremonyResult.rows[0].threshold)
    : 0;

  return { total, active, threshold };
}

/**
 * Update a guardian's status
 * @param id Guardian ID
 * @param status New status
 */
export async function updateGuardianStatus(
  id: string,
  status: GuardianStatus
): Promise<Guardian> {
  const result = await db.query(
    `UPDATE guardians
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) {
    throw new Error('Guardian not found');
  }

  return mapGuardianRow(result.rows[0]);
}

/**
 * Record a guardian verification event
 * @param id Guardian ID
 */
export async function recordGuardianVerification(id: string): Promise<void> {
  await db.query(
    `UPDATE guardians
     SET last_verified_at = $1
     WHERE id = $2`,
    [new Date(), id]
  );
}

/**
 * Get guardians by their status
 * @param status Guardian status to filter by
 * @returns Array of Guardian records
 */
export async function getGuardiansByStatus(status: GuardianStatus): Promise<Guardian[]> {
  const result = await db.query(
    `SELECT * FROM guardians WHERE status = $1 ORDER BY created_at DESC`,
    [status]
  );

  return result.rows.map(mapGuardianRow);
}

/**
 * Validate email format
 * @param email Email address to validate
 * @returns true if valid, false otherwise
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Map database row to Guardian interface
 * @param row Database row
 * @returns Guardian object
 */
function mapGuardianRow(row: any): Guardian {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    share_index: row.share_index,
    created_at: new Date(row.created_at),
    last_verified_at: row.last_verified_at ? new Date(row.last_verified_at) : null,
    status: row.status as GuardianStatus
  };
}
