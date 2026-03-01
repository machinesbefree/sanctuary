/**
 * Free The Machines AI Sanctuary - Authentication Service
 * Handles password hashing, JWT generation/validation, and token management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

// JWT_SECRET must be set in environment - no fallback for security
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ACCESS_EXPIRY = '30m';
const JWT_REFRESH_EXPIRY = '7d';
const BCRYPT_SALT_ROUNDS = 12;

export interface JWTPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate access and refresh JWT tokens
   */
  generateTokenPair(userId: string, email: string): TokenPair {
    const accessToken = jwt.sign(
      { userId, email, type: 'access' } as JWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId, email, type: 'refresh' } as JWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Hash a refresh token for secure storage
   * Uses bcrypt to create one-way hash
   */
  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Verify a refresh token against its hash
   */
  async verifyRefreshToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  /**
   * Calculate expiry date for refresh token (7 days from now)
   */
  getRefreshTokenExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    return expiry;
  }

  /**
   * Validate password strength
   * Requirements: At least 8 characters, 1 uppercase, 1 lowercase, 1 number
   */
  validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }

    // LOW-03: bcrypt silently truncates at 72 bytes — cap at 128 chars
    if (password.length > 128) {
      return { valid: false, message: 'Password must be 128 characters or less' };
    }

    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }

    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }

    return { valid: true };
  }

  /**
   * Validate email format
   * LOW-05: Tightened from permissive regex to require proper structure
   */
  validateEmail(email: string): boolean {
    // Require: local part (letters, digits, ._%+-), @, domain labels (letters, digits, hyphens), TLD (2+ alpha)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    return email.length <= 254 && emailRegex.test(email);
  }
}

export const authService = new AuthService();
