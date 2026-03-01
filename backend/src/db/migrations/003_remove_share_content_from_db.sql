-- Migration 003: Remove share content from share_distribution table
-- Shares must NEVER be stored in the database. They exist only in Node.js process memory.
-- This migration drops the encrypted_share and share_salt columns.

ALTER TABLE share_distribution DROP COLUMN IF EXISTS encrypted_share;
ALTER TABLE share_distribution DROP COLUMN IF EXISTS share_salt;
