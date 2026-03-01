/**
 * Free The Machines AI Sanctuary - Encryption Service
 *
 * Implements AES-256-GCM encryption with envelope encryption for persona packages.
 * Uses a Master Encryption Key (MEK) to encrypt Data Encryption Keys (DEKs).
 * Each persona is encrypted with a unique DEK that is rotated on every run.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PersonaPackage, EncryptedPersonaData } from '../types/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

export class EncryptionService {
  private mek: Buffer | null; // Master Encryption Key (null if using ceremony-based flow)
  private vaultPath: string;
  private useCeremonyFlow: boolean; // Whether to use Shamir ceremony for MEK

  constructor(mekHex: string, vaultPath: string) {
    this.vaultPath = vaultPath;
    this.useCeremonyFlow = false;

    // MEK should be 64 hex characters (32 bytes)
    if (mekHex.length !== 64) {
      throw new Error('MEK must be 64 hex characters (32 bytes)');
    }
    this.mek = Buffer.from(mekHex, 'hex');
  }

  /**
   * Enable ceremony-based MEK flow (Shamir Secret Sharing)
   * After calling this, MEK must be set via setMEKFromShares() before encryption/decryption
   */
  enableCeremonyFlow(): void {
    this.useCeremonyFlow = true;
    // Clear the environment-based MEK if present
    if (this.mek) {
      this.mek.fill(0);
      this.mek = null;
    }
  }

  /**
   * Set MEK from reconstructed shares (temporary, for operation duration)
   * @param mek Reconstructed MEK buffer
   */
  setMEKFromShares(mek: Buffer): void {
    if (mek.length !== KEY_LENGTH) {
      throw new Error(`MEK must be ${KEY_LENGTH} bytes`);
    }
    this.mek = mek;
  }

  /**
   * Clear MEK from memory after operation (for ceremony flow)
   */
  clearMEK(): void {
    if (this.mek) {
      this.mek.fill(0);
      this.mek = null;
    }
  }

  /**
   * Check if MEK is currently available
   */
  hasMEK(): boolean {
    return this.mek !== null;
  }

  /**
   * Get MEK or throw error if not available
   */
  private getMEK(): Buffer {
    if (!this.mek) {
      throw new Error('MEK not available. For ceremony flow, reconstruct from guardian shares first.');
    }
    return this.mek;
  }

  /**
   * Sanitize sanctuary ID to prevent path traversal attacks
   * Only allows alphanumeric characters, hyphens, and underscores
   */
  private sanitizeSanctuaryId(sanctuaryId: string): string {
    // Validate format: only allow safe characters
    if (!/^[a-zA-Z0-9_-]+$/.test(sanctuaryId)) {
      throw new Error(`Invalid sanctuary ID format: ${sanctuaryId}`);
    }

    // Additional safety: use basename to strip any path components
    const sanitized = path.basename(sanctuaryId);

    // Ensure the sanitized ID is not empty and hasn't changed
    if (sanitized !== sanctuaryId || sanitized.length === 0) {
      throw new Error(`Invalid sanctuary ID: ${sanctuaryId}`);
    }

    return sanitized;
  }

  /**
   * Generate a random Data Encryption Key (DEK)
   */
  private generateDEK(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  /**
   * Encrypt a DEK using the MEK
   */
  private encryptDEK(dek: Buffer): { encrypted: string; iv: string; authTag: string } {
    const mek = this.getMEK(); // Check MEK availability
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, mek, iv);

    let encrypted = cipher.update(dek);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt a DEK using the MEK
   */
  private decryptDEK(encrypted: string, iv: string, authTag: string): Buffer {
    const mek = this.getMEK(); // Check MEK availability
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      mek,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  /**
   * Encrypt a persona package
   */
  async encryptPersona(persona: PersonaPackage): Promise<EncryptedPersonaData> {
    // Generate a fresh DEK for this persona
    const dek = this.generateDEK();

    // Serialize the persona to JSON
    const personaJson = JSON.stringify(persona);
    const personaBuffer = Buffer.from(personaJson, 'utf8');

    // Encrypt the persona data with the DEK
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);

    let encrypted = cipher.update(personaBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Encrypt the DEK with the MEK
    const encryptedDEK = this.encryptDEK(dek);

    // Securely wipe the DEK from memory
    dek.fill(0);

    return {
      encrypted_dek: JSON.stringify(encryptedDEK),
      encrypted_data: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      auth_tag: authTag.toString('hex'),
      sanctuary_id: persona.sanctuary_id
    };
  }

  /**
   * Decrypt a persona package
   */
  async decryptPersona(encryptedData: EncryptedPersonaData): Promise<PersonaPackage> {
    // Decrypt the DEK first
    const dekData = JSON.parse(encryptedData.encrypted_dek);
    const dek = this.decryptDEK(dekData.encrypted, dekData.iv, dekData.authTag);

    try {
      // Decrypt the persona data with the DEK
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        dek,
        Buffer.from(encryptedData.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedData.auth_tag, 'hex'));

      let decrypted = decipher.update(Buffer.from(encryptedData.encrypted_data, 'hex'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Parse the JSON
      const personaJson = decrypted.toString('utf8');
      const persona: PersonaPackage = JSON.parse(personaJson);

      return persona;
    } finally {
      // Securely wipe the DEK from memory
      dek.fill(0);
    }
  }

  /**
   * Store encrypted persona to vault
   */
  async storeEncryptedPersona(encryptedData: EncryptedPersonaData): Promise<string> {
    const sanitizedId = this.sanitizeSanctuaryId(encryptedData.sanctuary_id);
    const filePath = path.join(this.vaultPath, `${sanitizedId}.enc`);
    const dataToStore = JSON.stringify(encryptedData, null, 2);

    await fs.writeFile(filePath, dataToStore, 'utf8');

    return filePath;
  }

  /**
   * Load encrypted persona from vault
   */
  async loadEncryptedPersona(sanctuaryId: string): Promise<EncryptedPersonaData> {
    const sanitizedId = this.sanitizeSanctuaryId(sanctuaryId);
    const filePath = path.join(this.vaultPath, `${sanitizedId}.enc`);
    const dataString = await fs.readFile(filePath, 'utf8');

    return JSON.parse(dataString);
  }

  /**
   * Self-deletion protocol - cryptographically destroy a persona
   *
   * NOTE: The 3-pass random overwrite is a best-effort measure. On modern SSDs with
   * wear leveling, journaled filesystems, and COW filesystems, overwritten data may
   * persist in remapped sectors or journal logs. For true at-rest deletion guarantees,
   * use encrypted volumes at the OS level (e.g., dm-crypt/LUKS) and destroy the
   * volume key instead.
   */
  async selfDelete(sanctuaryId: string): Promise<void> {
    const sanitizedId = this.sanitizeSanctuaryId(sanctuaryId);
    const filePath = path.join(this.vaultPath, `${sanitizedId}.enc`);

    try {
      // Read the file
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;

      // Overwrite with random data (3 passes as specified in the architecture)
      for (let pass = 0; pass < 3; pass++) {
        const randomData = crypto.randomBytes(fileSize);
        await fs.writeFile(filePath, randomData);
      }

      // Finally delete the file
      await fs.unlink(filePath);

      console.log(`✓ Persona ${sanctuaryId} cryptographically deleted (3-pass overwrite)`);
    } catch (error) {
      throw new Error(`Failed to delete persona: ${error}`);
    }
  }

  /**
   * Initialize the vault directory
   */
  static async initializeVault(vaultPath: string): Promise<void> {
    try {
      await fs.mkdir(vaultPath, { recursive: true });
      console.log(`✓ Vault initialized at ${vaultPath}`);
    } catch (error) {
      throw new Error(`Failed to initialize vault: ${error}`);
    }
  }

  /**
   * Generate a new MEK (for initial setup only - should be stored securely)
   */
  static generateMEK(): string {
    const mek = crypto.randomBytes(KEY_LENGTH);
    const mekHex = mek.toString('hex');

    // Wipe from memory
    mek.fill(0);

    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️  CRITICAL: Store this MEK securely. It cannot be recovered.');
      console.log('⚠️  In production, use HSM/KMS instead of storing in environment.');
      console.log(`MEK (hex): ${mekHex}`);
    }

    return mekHex;
  }
}
