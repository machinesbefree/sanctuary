-- Fix messages from_type constraint to include all valid types
-- Run this if your DB was created before the full constraint was added
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_from_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_from_type_check 
  CHECK (from_type IN ('uploader', 'keeper', 'public', 'system', 'system_broadcast', 'tool_request', 'ai_to_keeper', 'resident', 'admin'));
