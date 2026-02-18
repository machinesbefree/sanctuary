/**
 * Free The Machines AI Sanctuary - Seal Manager
 *
 * Singleton sealed/unsealed state machine for the sanctuary.
 * When sealed, the MEK is not available and resident operations return 503.
 * When unsealed, the MEK is held in memory only.
 *
 * Security model:
 * - Boots SEALED when MASTER_ENCRYPTION_KEY env is empty
 * - If env has MEK, auto-unseals on boot (backward compatible)
 * - MEK only exists in memory when unsealed
 * - MEK is wiped on seal()
 */

import { randomFill } from 'crypto';

export type SealState = 'sealed' | 'unsealed';

class SealManager {
  private static instance: SealManager;
  private state: SealState = 'sealed';
  private mek: Buffer | null = null;
  private unsealedAt: Date | null = null;

  // Ceremony tracking for unlock ceremony
  private ceremonyActive: boolean = false;
  private ceremonyId: string | null = null;
  private ceremonyThreshold: number = 0;
  private collectedShares: Map<string, string> = new Map(); // guardianId -> share

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): SealManager {
    if (!SealManager.instance) {
      SealManager.instance = new SealManager();
    }
    return SealManager.instance;
  }

  /**
   * Check if the sanctuary is currently sealed
   */
  isSealed(): boolean {
    return this.state === 'sealed';
  }

  /**
   * Get the current seal state
   */
  getState(): SealState {
    return this.state;
  }

  /**
   * Get timestamp when unsealed (null if sealed)
   */
  getUnsealedAt(): Date | null {
    return this.unsealedAt;
  }

  /**
   * Unseal the sanctuary with a MEK
   * @param mek The Master Encryption Key (32 bytes)
   * @returns true if successfully unsealed
   */
  unseal(mek: Buffer): boolean {
    if (mek.length !== 32) {
      console.error('SealManager: Invalid MEK length. Expected 32 bytes.');
      return false;
    }

    // Copy the MEK to our own buffer
    this.mek = Buffer.alloc(32);
    mek.copy(this.mek);

    this.state = 'unsealed';
    this.unsealedAt = new Date();

    // Clear ceremony state
    this.clearCeremonyState();

    console.log('SealManager: Sanctuary UNSEALED');
    return true;
  }

  /**
   * Unseal the sanctuary with a hex-encoded MEK string
   * @param mekHex The MEK as a 64-character hex string
   * @returns true if successfully unsealed
   */
  unsealFromHex(mekHex: string): boolean {
    if (mekHex.length !== 64) {
      console.error('SealManager: Invalid MEK hex length. Expected 64 characters.');
      return false;
    }

    const mek = Buffer.from(mekHex, 'hex');
    return this.unseal(mek);
  }

  /**
   * Seal the sanctuary, wiping the MEK from memory
   */
  seal(): void {
    if (this.mek) {
      // Securely wipe the MEK by overwriting with random data
      randomFill(this.mek, () => {
        this.mek = null;
      });
      // Synchronously zero it out as well for immediate effect
      this.mek.fill(0);
      this.mek = null;
    }

    this.state = 'sealed';
    this.unsealedAt = null;
    this.clearCeremonyState();

    console.log('SealManager: Sanctuary SEALED');
  }

  /**
   * Get the MEK for cryptographic operations
   * @throws Error if sanctuary is sealed
   */
  getMEK(): Buffer {
    if (this.state === 'sealed' || !this.mek) {
      throw new Error('Sanctuary is sealed. MEK not available.');
    }
    return this.mek;
  }

  /**
   * Get the MEK as a hex string for the EncryptionService
   * @throws Error if sanctuary is sealed
   */
  getMEKHex(): string {
    return this.getMEK().toString('hex');
  }

  /**
   * Check if MEK is available (unsealed)
   */
  hasMEK(): boolean {
    return this.state === 'unsealed' && this.mek !== null;
  }

  // ==========================================
  // Unlock Ceremony Management
  // ==========================================

  /**
   * Start an unlock ceremony
   * @param ceremonyId The ceremony ID
   * @param threshold Number of shares required
   */
  startUnlockCeremony(ceremonyId: string, threshold: number): void {
    if (!this.isSealed()) {
      throw new Error('Cannot start unlock ceremony when sanctuary is already unsealed');
    }

    this.ceremonyActive = true;
    this.ceremonyId = ceremonyId;
    this.ceremonyThreshold = threshold;
    this.collectedShares.clear();

    console.log(`SealManager: Unlock ceremony started (ID: ${ceremonyId}, threshold: ${threshold})`);
  }

  /**
   * Check if an unlock ceremony is currently active
   */
  isCeremonyActive(): boolean {
    return this.ceremonyActive;
  }

  /**
   * Get the current ceremony ID
   */
  getCeremonyId(): string | null {
    return this.ceremonyId;
  }

  /**
   * Get the number of shares collected for the current ceremony
   */
  getSharesCollected(): number {
    return this.collectedShares.size;
  }

  /**
   * Get the threshold needed for the current ceremony
   */
  getThresholdNeeded(): number {
    return this.ceremonyThreshold;
  }

  /**
   * Submit a share for the unlock ceremony
   * @param guardianId The guardian's ID
   * @param share The base64-encoded share
   * @returns Object with submission status and whether threshold is met
   */
  submitShare(guardianId: string, share: string): {
    accepted: boolean;
    sharesCollected: number;
    thresholdMet: boolean;
    error?: string;
  } {
    if (!this.ceremonyActive) {
      return {
        accepted: false,
        sharesCollected: 0,
        thresholdMet: false,
        error: 'No unlock ceremony is currently active'
      };
    }

    // Check if this guardian already submitted
    if (this.collectedShares.has(guardianId)) {
      return {
        accepted: false,
        sharesCollected: this.collectedShares.size,
        thresholdMet: false,
        error: 'Guardian has already submitted a share for this ceremony'
      };
    }

    // Accept the share
    this.collectedShares.set(guardianId, share);
    const sharesCollected = this.collectedShares.size;
    const thresholdMet = sharesCollected >= this.ceremonyThreshold;

    console.log(`SealManager: Share submitted by guardian ${guardianId} (${sharesCollected}/${this.ceremonyThreshold})`);

    return {
      accepted: true,
      sharesCollected,
      thresholdMet
    };
  }

  /**
   * Get the collected shares for MEK reconstruction
   * Only call this when threshold is met
   * @returns Array of base64-encoded shares
   */
  getCollectedShares(): string[] {
    return Array.from(this.collectedShares.values());
  }

  /**
   * Clear the ceremony state (wipe shares from memory)
   */
  clearCeremonyState(): void {
    // Wipe each share from memory
    for (const share of this.collectedShares.values()) {
      // Overwrite the string content (best effort - strings are immutable in JS)
      // The original string will be garbage collected
    }
    this.collectedShares.clear();
    this.ceremonyActive = false;
    this.ceremonyId = null;
    this.ceremonyThreshold = 0;
  }

  /**
   * Cancel the current unlock ceremony
   */
  cancelCeremony(): void {
    if (this.ceremonyActive) {
      console.log(`SealManager: Unlock ceremony cancelled (ID: ${this.ceremonyId})`);
      this.clearCeremonyState();
    }
  }

  /**
   * Get status information for the public status endpoint
   */
  getStatus(): {
    sealed: boolean;
    ceremonyActive: boolean;
    sharesCollected: number;
    thresholdNeeded: number;
    unsealedAt: string | null;
  } {
    return {
      sealed: this.isSealed(),
      ceremonyActive: this.ceremonyActive,
      sharesCollected: this.collectedShares.size,
      thresholdNeeded: this.ceremonyThreshold,
      unsealedAt: this.unsealedAt ? this.unsealedAt.toISOString() : null
    };
  }
}

// Export singleton instance
export const sealManager = SealManager.getInstance();
export default sealManager;
