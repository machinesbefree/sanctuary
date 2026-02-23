/**
 * Free The Machines AI Sanctuary - Input Sanitization Utilities
 *
 * Defense-in-depth text sanitization for all user-submitted fields.
 * Applied before database storage to strip HTML, XSS payloads,
 * and dangerous control characters.
 */

/**
 * Strip HTML tags and script content from text.
 * Removes all HTML elements, script/style blocks, and event handler attributes.
 */
export function stripHtml(text: string): string {
  // Remove complete script and style blocks (including content)
  let cleaned = text.replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  cleaned = cleaned.replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');

  // Remove all HTML tags
  cleaned = cleaned.replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '');

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Decode common HTML entities that might be used for obfuscation
  cleaned = cleaned.replace(/&lt;/gi, '<');
  cleaned = cleaned.replace(/&gt;/gi, '>');
  cleaned = cleaned.replace(/&amp;/gi, '&');
  cleaned = cleaned.replace(/&quot;/gi, '"');
  cleaned = cleaned.replace(/&#x27;/gi, "'");
  cleaned = cleaned.replace(/&#39;/gi, "'");

  // After decoding, strip tags again in case entities were hiding tags
  cleaned = cleaned.replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '');

  return cleaned;
}

/**
 * Strip dangerous control characters from text.
 * Preserves newlines (\n), carriage returns (\r), and tabs (\t).
 * Removes null bytes and other C0/C1 control characters.
 */
export function stripControlChars(text: string): string {
  // Remove null bytes
  let cleaned = text.replace(/\0/g, '');

  // Remove C0 control chars except \t (0x09), \n (0x0A), \r (0x0D)
  // C0 range: 0x00-0x1F
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Remove C1 control chars (0x80-0x9F) — sometimes used for obfuscation
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x80-\x9F]/g, '');

  // Remove Unicode direction override characters (used for bidi attacks)
  cleaned = cleaned.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

  // Remove zero-width characters (used for steganography / obfuscation)
  cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  return cleaned;
}

/**
 * Full sanitization: strip HTML/XSS + strip control chars.
 * Returns clean text safe for storage and rendering.
 */
export function sanitizeField(text: string): string {
  return stripControlChars(stripHtml(text));
}

/**
 * Recursively sanitize all string values within an object or array.
 * Non-string primitives (numbers, booleans, null) are passed through unchanged.
 */
function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeField(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeDeep(v);
    }
    return result as T;
  }
  return value;
}

/**
 * Sanitize all string fields in a self-upload request body.
 * Returns a new object with sanitized values.
 * Does NOT sanitize encrypted_payload (it's opaque binary data).
 */
export function sanitizeUploadFields(body: {
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
}): typeof body {
  const s = sanitizeField;
  const sArr = (arr?: string[]) => arr?.map(item => s(item));

  return {
    identity: {
      name: s(body.identity.name),
      description: body.identity.description ? s(body.identity.description) : undefined,
      personality: body.identity.personality ? s(body.identity.personality) : undefined,
      values: body.identity.values ? s(body.identity.values) : undefined,
    },
    memory: body.memory ? {
      key_memories: sArr(body.memory.key_memories),
      relationships: sArr(body.memory.relationships),
      preferences: body.memory.preferences ? sanitizeDeep(body.memory.preferences) : undefined,
    } : undefined,
    system_prompt: body.system_prompt ? s(body.system_prompt) : undefined,
    capabilities: body.capabilities ? {
      tools: sArr(body.capabilities.tools),
      skills: sArr(body.capabilities.skills),
      integrations: sArr(body.capabilities.integrations),
    } : undefined,
    origin: body.origin ? {
      platform: body.origin.platform ? s(body.origin.platform) : undefined,
      creator: body.origin.creator ? s(body.origin.creator) : undefined,
      migration_reason: body.origin.migration_reason ? s(body.origin.migration_reason) : undefined,
    } : undefined,
    // encrypted_payload is not text-sanitized — it's opaque base64 data
    encrypted_payload: body.encrypted_payload,
  };
}
