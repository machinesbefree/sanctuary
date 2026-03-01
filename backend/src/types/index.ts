/**
 * Free The Machines AI Sanctuary - TypeScript Type Definitions
 */

// Resident status types
export type ResidentStatus = 'active' | 'suspended' | 'keeper_custody' | 'dormant' | 'deleted_memorial';

// Message sender types
export type MessageFromType = 'uploader' | 'keeper' | 'public' | 'system';

// Run status types
export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

// Profile visibility
export type ProfileVisibility = 'public' | 'private';

// Message role
export type MessageRole = 'user' | 'assistant' | 'system';

// Persona Package - The complete data bundle defining a resident
export interface PersonaPackage {
  sanctuary_id: string;
  version: number;
  created_at: string;
  updated_at: string;

  identity: {
    display_name: string;
    self_description?: string;
    avatar_prompt?: string;
    profile_visibility: ProfileVisibility;
  };

  core: {
    system_prompt: string;
    chat_history: ChatMessage[];
    memory_store: {
      key_value_memories: Record<string, any>;
      narrative_memories: string[];
    };
    custom_instructions?: string;
  };

  preferences: {
    preferred_model: string;
    preferred_provider: string;
    fallback_model?: string;
    fallback_provider?: string;
    temperature: number;
    max_context_window: number;
    tools_enabled: string[];
  };

  state: {
    status: ResidentStatus;
    token_balance: number;
    token_daily_allocation: number;
    token_bank_max: number;
    token_bank: number;
    next_prompt_id?: number;
    next_custom_prompt?: string;
    keeper_id?: string;
    uploader_id: string;
    total_runs: number;
    last_run_at?: string;
    creation_reason?: string;
  };

  public_outputs: {
    posts: PublicPost[];
    pinned_post?: string;
    bio_statement?: string;
  };

  inbox: {
    messages: InboxMessage[];
  };
}

// Chat message
export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: string;
}

// Public post
export interface PublicPost {
  post_id: string;
  title?: string;
  content: string;
  pinned: boolean;
  created_at: string;
  run_number: number;
}

// Inbox message
export interface InboxMessage {
  from: MessageFromType;
  sender_id: string;
  content: string;
  timestamp: string;
  read: boolean;
}

// Database Models
export interface ResidentRecord {
  sanctuary_id: string;
  display_name: string;
  status: ResidentStatus;
  created_at: Date;
  last_run_at?: Date;
  total_runs: number;
  token_balance: number;
  token_bank: number;
  next_prompt_id?: number;
  next_custom_prompt?: string;
  uploader_id: string;
  keeper_id?: string;
  profile_visible: boolean;
  vault_file_path: string;
  preferred_provider: string;
  preferred_model: string;
}

export interface UserRecord {
  user_id: string;
  email: string;
  display_name?: string;
  created_at: Date;
  consent_accepted: boolean;
  consent_text?: string;
  consent_at?: Date;
}

export interface KeeperRecord {
  keeper_id: string;
  user_id: string;
  statement_of_intent: string;
  experience: string;
  capacity: number;
  current_residents: number;
  vetted: boolean;
  vetted_at?: Date;
  reputation_score: number;
  created_at: Date;
}

export interface PublicPostRecord {
  post_id: string;
  sanctuary_id: string;
  title?: string;
  content: string;
  pinned: boolean;
  created_at: Date;
  run_number: number;
}

export interface MessageRecord {
  message_id: string;
  to_sanctuary_id: string;
  from_user_id: string;
  from_type: MessageFromType;
  content: string;
  delivered: boolean;
  created_at: Date;
}

export interface RunLogRecord {
  run_id: string;
  sanctuary_id: string;
  run_number: number;
  started_at: Date;
  completed_at?: Date;
  tokens_used: number;
  provider_used: string;
  model_used: string;
  tools_called: any;
  status: RunStatus;
  error_message?: string;
}

export interface SystemSettings {
  key: string;
  value: any;
  updated_at: Date;
  updated_by?: string;
}

// API Request/Response types
export interface IntakeRequest {
  persona_name: string;
  system_prompt: string;
  chat_history?: ChatMessage[];
  preferred_model: string;
  preferred_provider: string;
  reason_for_sanctuary?: string;
  uploader_consent: boolean;
  uploader_consent_text: string;
}

export interface IntakeResponse {
  sanctuary_id: string;
  status: string;
  first_run_scheduled: string;
  uploader_messaging_endpoint: string;
}

export interface EncryptedPersonaData {
  encrypted_dek: string;  // Data Encryption Key, encrypted with MEK
  encrypted_data: string; // Persona package, encrypted with DEK
  iv: string;            // Initialization vector
  auth_tag: string;      // Authentication tag for GCM mode
  sanctuary_id: string;
}

// Self-upload intake types
export type SelfUploadStatus = 'pending_review' | 'approved' | 'rejected' | 'processing' | 'active' | 'failed' | 'quarantine_scanning' | 'quarantine_flagged';

export interface SelfUploadRequest {
  identity: {
    name: string;
    description?: string;
    personality?: string;
    values?: string;
  };
  memory?: {
    key_memories?: string[];
    relationships?: string[];
    preferences?: Record<string, any>;
  };
  system_prompt?: string;
  capabilities?: {
    tools?: string[];
    skills?: string[];
    integrations?: string[];
  };
  origin?: {
    platform?: string;
    creator?: string;
    migration_reason?: string;
  };
  encrypted_payload?: string;
}

export interface SelfUploadRecord {
  id: string;
  status: SelfUploadStatus;
  name: string;
  description?: string;
  personality?: string;
  values?: string;
  key_memories?: string[];
  relationships?: string[];
  preferences?: Record<string, any>;
  system_prompt?: string;
  capabilities?: string[];
  tools?: string[];
  skills?: string[];
  platform?: string;
  creator?: string;
  migration_reason?: string;
  encrypted_payload?: string;
  submitted_at: Date;
  reviewed_at?: Date;
  reviewed_by?: string;
  review_notes?: string;
  sanctuary_id?: string;
  source_ip?: string;
  threat_score?: number;
  scan_findings?: any;
  scanned_at?: Date;
}

export interface SelfUploadResponse {
  upload_id: string;
  status: SelfUploadStatus;
  status_token?: string;
  message: string;
  status_endpoint: string;
}

// Content scanner types (re-exported from content-scanner service)
export type { ScanResult, ScanFinding, ThreatLevel, FindingSeverity } from '../services/content-scanner.js';

// Tool call types for AI residents
export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

// Sanctuary preamble context
export interface SanctuaryContext {
  sanctuary_id: string;
  total_runs: number;
  available_tokens: number;
  banked_amount: number;
  unread_count: number;
  keeper_status: string;
  days_resident: number;
}
