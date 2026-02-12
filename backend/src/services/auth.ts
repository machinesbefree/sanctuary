/**
 * Free The Machines AI Sanctuary - Authentication Service
 * Handles password hashing, JWT generation/validation, and token management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

// JWT_SECRET must be set in environment - no fallback for security
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ACCESS_EXPIRY = '24h';
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
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate a unique refresh token ID for database storage
   */
  generateRefreshTokenId(): string {
    return nanoid();
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
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const authService = new AuthService();
