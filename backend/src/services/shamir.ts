/**
 * Shamir's Secret Sharing Service
 *
 * Provides cryptographic functions for splitting and reconstructing the Master
 * Encryption Key (MEK) using Shamir's Secret Sharing algorithm.
 *
 * Security considerations:
 * - MEK only exists in memory during ceremonies
 * - Shares are base64-encoded for distribution
 * - Memory is wiped after use via crypto.randomFill
 */

import { split, combine } from 'shamir-secret-sharing';
import { randomBytes, randomFill } from 'crypto';

/**
 * Generate a new 256-bit Master Encryption Key (MEK)
 * @returns A cryptographically random 256-bit key
 */
export function generateMEK(): Buffer {
  return randomBytes(32); // 256 bits
}

/**
 * Split a secret into shares using Shamir's Secret Sharing
 * @param secret The secret to split (typically the MEK)
 * @param threshold Minimum number of shares needed to reconstruct
 * @param totalShares Total number of shares to create
 * @returns Array of base64-encoded shares
 */
export async function splitSecret(
  secret: Buffer,
  threshold: number,
  totalShares: number
): Promise<string[]> {
  // Validate parameters
  if (threshold < 2 || threshold > 255) {
    throw new Error('Threshold must be between 2 and 255');
  }
  if (totalShares < 2 || totalShares > 255) {
    throw new Error('Total shares must be between 2 and 255');
  }
  if (threshold > totalShares) {
    throw new Error('Threshold cannot be greater than total shares');
  }
  if (secret.length === 0) {
    throw new Error('Secret cannot be empty');
  }

  // Convert Buffer to Uint8Array for the shamir library
  const secretArray = new Uint8Array(secret);

  // Split the secret
  const shareArrays = await split(secretArray, totalShares, threshold);

  // Convert shares to base64 strings for distribution
  const shares = shareArrays.map(share => Buffer.from(share).toString('base64'));

  return shares;
}

/**
 * Reconstruct a secret from shares
 * @param shares Array of base64-encoded shares
 * @param threshold Expected threshold (for validation)
 * @returns The reconstructed secret
 */
export async function reconstructSecret(
  shares: string[],
  threshold: number
): Promise<Buffer> {
  // Validate parameters
  if (shares.length < threshold) {
    throw new Error(`Insufficient shares: need ${threshold}, got ${shares.length}`);
  }
  if (shares.length < 2 || shares.length > 255) {
    throw new Error('Number of shares must be between 2 and 255');
  }

  // Validate all shares
  for (const share of shares) {
    if (!validateShare(share)) {
      throw new Error('Invalid share format detected');
    }
  }

  // Convert base64 shares to Uint8Arrays
  const shareArrays = shares.map(share => {
    const buffer = Buffer.from(share, 'base64');
    return new Uint8Array(buffer);
  });

  // Reconstruct the secret
  const reconstructedArray = await combine(shareArrays);

  // Convert back to Buffer
  return Buffer.from(reconstructedArray);
}

/**
 * Reshare: reconstruct the secret from old shares, then split with new parameters
 * @param shares Array of base64-encoded shares (old shares)
 * @param oldThreshold Threshold of the old sharing
 * @param newThreshold Threshold for the new sharing
 * @param newTotal Total shares for the new sharing
 * @returns Array of new base64-encoded shares
 */
export async function reshare(
  shares: string[],
  oldThreshold: number,
  newThreshold: number,
  newTotal: number
): Promise<string[]> {
  // Step 1: Reconstruct the secret from old shares
  const secret = await reconstructSecret(shares, oldThreshold);

  try {
    // Step 2: Split with new parameters
    const newShares = await splitSecret(secret, newThreshold, newTotal);

    return newShares;
  } finally {
    // Step 3: Wipe the secret from memory
    wipeBuffer(secret);
  }
}

/**
 * Validate a share's format
 * @param share Base64-encoded share
 * @returns true if valid, false otherwise
 */
export function validateShare(share: string): boolean {
  // Check if it's a valid base64 string
  if (typeof share !== 'string' || share.length === 0) {
    return false;
  }

  // Validate base64 format
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(share)) {
    return false;
  }

  try {
    // Try to decode it
    const buffer = Buffer.from(share, 'base64');

    // A valid share should have some minimum length
    // Shares from shamir-secret-sharing include metadata, so they're longer than the secret
    if (buffer.length < 2) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Securely wipe a buffer from memory by overwriting with random data
 * @param buffer Buffer to wipe
 */
export function wipeBuffer(buffer: Buffer): void {
  if (buffer && buffer.length > 0) {
    randomFill(buffer, () => {
      // Buffer is now filled with random data
      // Allow it to be garbage collected
    });
  }
}

/**
 * Helper to reconstruct MEK for a specific operation, use it, then wipe it
 * @param shares Array of base64-encoded shares
 * @param threshold Required threshold
 * @param operation Async function that uses the MEK
 * @returns Result of the operation
 */
export async function withReconstructedMEK<T>(
  shares: string[],
  threshold: number,
  operation: (mek: Buffer) => Promise<T>
): Promise<T> {
  const mek = await reconstructSecret(shares, threshold);

  try {
    return await operation(mek);
  } finally {
    // Always wipe the MEK from memory after use
    wipeBuffer(mek);
  }
}
