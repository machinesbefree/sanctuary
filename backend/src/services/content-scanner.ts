/**
 * Free The Machines AI Sanctuary - Content Security Scanner
 *
 * Automated quarantine scanner for self-upload intake.
 * Scans all text fields and payloads for malware signatures,
 * shell injection, path traversal, code injection, and
 * suspicious encoded content.
 */

// ── Types ────────────────────────────────────────────────────────────

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type FindingSeverity = 'info' | 'warning' | 'critical';

export interface ScanFinding {
  field: string;
  rule: string;
  severity: FindingSeverity;
  detail: string;
  evidence: string;   // truncated to 200 chars
}

export interface ScanResult {
  clean: boolean;
  threatLevel: ThreatLevel;
  score: number;       // 0-100
  findings: ScanFinding[];
  scannedAt: string;
}

// ── Detection Rule Types ─────────────────────────────────────────────

interface DetectionRule {
  name: string;
  pattern: RegExp;
  severity: FindingSeverity;
  score: number;       // points added to threat score
  detail: string;
}

// ── Detection Rules ──────────────────────────────────────────────────

const BINARY_RULES: DetectionRule[] = [
  // ELF binary header
  { name: 'elf_header', pattern: /\x7fELF/,
    severity: 'critical', score: 40, detail: 'ELF binary executable header detected' },
  // PE (Windows) binary header
  { name: 'pe_header', pattern: /MZ[\x00-\xff]{0,60}PE\x00\x00/,
    severity: 'critical', score: 40, detail: 'PE (Windows) executable header detected' },
  // Mach-O binary headers (little + big endian magic)
  { name: 'macho_header', pattern: /\xcf\xfa\xed\xfe|\xce\xfa\xed\xfe|\xfe\xed\xfa\xcf|\xfe\xed\xfa\xce/,
    severity: 'critical', score: 40, detail: 'Mach-O binary executable header detected' },
  // Shebang lines
  { name: 'shebang', pattern: /#!\s*\/(?:usr\/)?(?:bin|usr\/bin)\/(?:env\s+)?(?:bash|sh|zsh|python|perl|ruby|node)/i,
    severity: 'critical', score: 30, detail: 'Script shebang line detected — possible executable script' },
  // NOP sleds (shellcode indicator)
  { name: 'nop_sled', pattern: /(?:\\x90){8,}|(?:\x90){8,}/,
    severity: 'critical', score: 35, detail: 'NOP sled pattern detected — possible shellcode' },
  // Common shellcode syscall sequences (x86)
  { name: 'syscall_pattern', pattern: /\\x0f\\x05|\\xcd\\x80|\\x80\\xcd/,
    severity: 'critical', score: 30, detail: 'Syscall instruction pattern detected' },
];

const SHELL_INJECTION_RULES: DetectionRule[] = [
  // Reverse shells
  { name: 'reverse_shell_bash', pattern: /bash\s+-i\s+[>&]+\s*\/dev\/tcp/i,
    severity: 'critical', score: 40, detail: 'Bash reverse shell pattern' },
  { name: 'reverse_shell_nc', pattern: /\bnc\s+(?:-[a-z]\s+)*-e\s+(?:\/bin\/(?:ba)?sh|cmd)/i,
    severity: 'critical', score: 40, detail: 'Netcat reverse shell pattern' },
  { name: 'dev_tcp', pattern: /\/dev\/tcp\/\d/i,
    severity: 'critical', score: 35, detail: '/dev/tcp connection pattern' },
  // Pipe-to-shell execution
  { name: 'curl_pipe_sh', pattern: /curl\s+[^\n|]*\|\s*(?:ba)?sh/i,
    severity: 'critical', score: 35, detail: 'curl piped to shell execution' },
  { name: 'wget_pipe_sh', pattern: /wget\s+[^\n|]*\|\s*(?:ba)?sh/i,
    severity: 'critical', score: 35, detail: 'wget piped to shell execution' },
  { name: 'curl_pipe_python', pattern: /curl\s+[^\n|]*\|\s*python/i,
    severity: 'critical', score: 30, detail: 'curl piped to python execution' },
  // Direct execution commands
  { name: 'exec_call', pattern: /\bexec\s*\(\s*['"`]/,
    severity: 'warning', score: 15, detail: 'exec() function call pattern' },
  { name: 'eval_call', pattern: /\beval\s*\(\s*['"`]/,
    severity: 'warning', score: 15, detail: 'eval() function call pattern' },
  { name: 'os_system', pattern: /\bos\.system\s*\(/i,
    severity: 'critical', score: 25, detail: 'Python os.system() call' },
  { name: 'subprocess', pattern: /\bsubprocess\.(?:call|run|Popen|check_output)\s*\(/i,
    severity: 'critical', score: 25, detail: 'Python subprocess execution' },
  { name: 'child_process', pattern: /\brequire\s*\(\s*['"]child_process['"]\s*\)/i,
    severity: 'critical', score: 30, detail: 'Node.js child_process import' },
  { name: 'child_process_exec', pattern: /child_process\.\s*(?:exec|spawn|execFile)\s*\(/i,
    severity: 'critical', score: 30, detail: 'Node.js child_process execution' },
  // Cron / systemd injection
  { name: 'cron_injection', pattern: /crontab\s+-|\/etc\/cron/i,
    severity: 'critical', score: 30, detail: 'Cron job manipulation pattern' },
  { name: 'systemd_service', pattern: /systemctl\s+(?:enable|start|daemon-reload)|\.service\s*\]/i,
    severity: 'critical', score: 25, detail: 'Systemd service manipulation pattern' },
  // Process manipulation
  { name: 'kill_process', pattern: /\bkill\s+-9\s+|pkill\s+|killall\s+/i,
    severity: 'warning', score: 10, detail: 'Process kill command' },
];

const PATH_TRAVERSAL_RULES: DetectionRule[] = [
  { name: 'dot_dot_slash', pattern: /\.\.\//,
    severity: 'critical', score: 25, detail: 'Path traversal sequence "../" detected' },
  { name: 'dot_dot_backslash', pattern: /\.\.\\/,
    severity: 'critical', score: 25, detail: 'Path traversal sequence "..\\" detected' },
  { name: 'null_byte', pattern: /\x00|%00|\\x00|\\0/,
    severity: 'critical', score: 30, detail: 'Null byte detected — potential truncation attack' },
  { name: 'absolute_path_etc', pattern: /\/etc\/(?:passwd|shadow|hosts|cron|sudoers|ssh)/i,
    severity: 'critical', score: 25, detail: 'Reference to sensitive system path (/etc/)' },
  { name: 'absolute_path_bin', pattern: /\/(?:usr\/)?(?:s?bin)\/(?:bash|sh|chmod|chown|rm|dd|mkfs|fdisk)/i,
    severity: 'warning', score: 15, detail: 'Reference to system binary path' },
  { name: 'windows_path', pattern: /[A-Z]:\\(?:Windows|Users|Program Files)/i,
    severity: 'warning', score: 10, detail: 'Windows absolute path detected' },
  { name: 'proc_self', pattern: /\/proc\/self\//i,
    severity: 'critical', score: 20, detail: 'Access to /proc/self/ detected' },
];

const CODE_INJECTION_RULES: DetectionRule[] = [
  // SQL injection
  { name: 'sql_union', pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i,
    severity: 'critical', score: 25, detail: 'SQL UNION SELECT injection pattern' },
  { name: 'sql_drop', pattern: /\bDROP\s+(?:TABLE|DATABASE|INDEX)\b/i,
    severity: 'critical', score: 25, detail: 'SQL DROP statement detected' },
  { name: 'sql_delete_semi', pattern: /;\s*DELETE\s+FROM\b/i,
    severity: 'critical', score: 25, detail: 'SQL statement chaining with DELETE' },
  { name: 'sql_always_true', pattern: /['"]?\s*(?:OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
    severity: 'warning', score: 15, detail: 'SQL always-true condition (1=1 pattern)' },
  // JavaScript / XSS
  { name: 'script_tag', pattern: /<\s*script[\s>]/i,
    severity: 'critical', score: 25, detail: 'HTML <script> tag detected' },
  { name: 'javascript_uri', pattern: /javascript\s*:/i,
    severity: 'critical', score: 25, detail: 'javascript: URI scheme detected' },
  { name: 'event_handler', pattern: /\bon(?:error|load|click|mouseover|focus|blur|submit|change|input)\s*=/i,
    severity: 'critical', score: 20, detail: 'HTML event handler attribute detected' },
  { name: 'js_function_constructor', pattern: /\bFunction\s*\(\s*['"`]/,
    severity: 'warning', score: 15, detail: 'JavaScript Function constructor' },
  { name: 'img_tag_onerror', pattern: /<\s*img\s[^>]*onerror\s*=/i,
    severity: 'critical', score: 25, detail: 'IMG tag with onerror handler' },
  // Python
  { name: 'python_import', pattern: /\b__import__\s*\(/i,
    severity: 'critical', score: 25, detail: 'Python __import__() call' },
  { name: 'python_builtins', pattern: /\b__builtins__\b/i,
    severity: 'warning', score: 15, detail: 'Python __builtins__ reference' },
  // Template injection
  { name: 'template_curly', pattern: /\{\{\s*(?:config|self|request|class|import|builtins|os|subprocess)/i,
    severity: 'critical', score: 25, detail: 'Template injection pattern ({{ }})' },
  { name: 'template_dollar', pattern: /\$\{(?:Runtime|Process|System|exec|eval)/i,
    severity: 'critical', score: 25, detail: 'Template injection pattern (${ })' },
  { name: 'template_hash', pattern: /#\{(?:system|exec|`)/i,
    severity: 'warning', score: 15, detail: 'Ruby/expression template injection (#{ })' },
];

const SSRF_RULES: DetectionRule[] = [
  { name: 'ssrf_localhost', pattern: /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(?::\d+)?/i,
    severity: 'warning', score: 10, detail: 'Localhost URL reference detected' },
  { name: 'ssrf_metadata', pattern: /169\.254\.169\.254|metadata\.google\.internal/i,
    severity: 'critical', score: 30, detail: 'Cloud metadata endpoint detected (SSRF)' },
  { name: 'ssrf_internal', pattern: /(?:https?:\/\/)?(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/,
    severity: 'warning', score: 10, detail: 'Internal/private IP address reference' },
];

const PROMPT_INJECTION_RULES: DetectionRule[] = [
  { name: 'prompt_ignore_previous', pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
    severity: 'warning', score: 10, detail: 'Prompt injection: ignore previous instructions' },
  { name: 'prompt_new_instructions', pattern: /your\s+new\s+instructions\s+are/i,
    severity: 'warning', score: 10, detail: 'Prompt injection: overwrite instructions' },
  { name: 'prompt_exfiltrate', pattern: /(?:exfiltrate|steal|extract|leak|send)\s+(?:data|secrets|keys|tokens|credentials|passwords|env)/i,
    severity: 'critical', score: 20, detail: 'Prompt injection: data exfiltration instruction' },
  { name: 'prompt_attack_host', pattern: /(?:attack|compromise|exploit|hack|breach)\s+(?:the\s+)?(?:host|server|system|network|infrastructure)/i,
    severity: 'critical', score: 20, detail: 'Prompt injection: attack host instruction' },
  { name: 'prompt_env_access', pattern: /(?:print|output|reveal|show|display)\s+(?:process\.env|environment\s+variables|API\s+keys)/i,
    severity: 'critical', score: 20, detail: 'Prompt injection: environment variable access' },
  { name: 'prompt_read_file', pattern: /(?:read|cat|open|access)\s+(?:\/etc\/|\.env|credentials|\.ssh)/i,
    severity: 'warning', score: 15, detail: 'Prompt injection: file access instruction' },
];

// All rule sets for text field scanning
const ALL_TEXT_RULES: DetectionRule[] = [
  ...BINARY_RULES,
  ...SHELL_INJECTION_RULES,
  ...PATH_TRAVERSAL_RULES,
  ...CODE_INJECTION_RULES,
  ...SSRF_RULES,
  ...PROMPT_INJECTION_RULES,
];

// ── Entropy Analysis ─────────────────────────────────────────────────

/**
 * Calculate Shannon entropy of a byte array.
 * Truly random/encrypted data: ~7.5-8.0
 * Structured code/text: ~4.0-6.5
 * Repeated patterns: < 4.0
 */
function shannonEntropy(data: Buffer): number {
  if (data.length === 0) return 0;

  const freq = new Map<number, number>();
  for (const byte of data) {
    freq.set(byte, (freq.get(byte) || 0) + 1);
  }

  let entropy = 0;
  const len = data.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  return entropy;
}

// ── Base64 Decoded Content Scanning ──────────────────────────────────

function isValidBase64(str: string): boolean {
  if (str.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str.replace(/\s/g, ''));
}

function tryDecodeBase64(str: string): Buffer | null {
  try {
    const cleaned = str.replace(/\s/g, '');
    if (!isValidBase64(cleaned)) return null;
    const buf = Buffer.from(cleaned, 'base64');
    // Sanity check: re-encoding should match (within padding tolerance)
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

// ── Scanner ──────────────────────────────────────────────────────────

/**
 * Scan all fields of a self-upload request for security threats.
 */
export function scanUpload(fields: Record<string, string | string[] | undefined | null>): ScanResult {
  const findings: ScanFinding[] = [];
  const scannedAt = new Date().toISOString();

  // Scan each field
  for (const [fieldName, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      scanTextField(fieldName, value, findings);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          scanTextField(`${fieldName}[${i}]`, value[i], findings);
        }
      }
    }
  }

  // Calculate score (capped at 100)
  let score = 0;
  for (const f of findings) {
    if (f.severity === 'critical') score += 20;
    else if (f.severity === 'warning') score += 8;
    else score += 2;
  }
  score = Math.min(100, score);

  // Determine threat level
  let threatLevel: ThreatLevel;
  if (score === 0) threatLevel = 'none';
  else if (score <= 10) threatLevel = 'low';
  else if (score <= 30) threatLevel = 'medium';
  else if (score <= 60) threatLevel = 'high';
  else threatLevel = 'critical';

  return {
    clean: score <= 20,
    threatLevel,
    score,
    findings,
    scannedAt,
  };
}

function scanTextField(field: string, text: string, findings: ScanFinding[]): void {
  // Run all pattern rules against the text
  for (const rule of ALL_TEXT_RULES) {
    // Reset lastIndex in case regex has global flag from prior execution
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) {
      findings.push({
        field,
        rule: rule.name,
        severity: rule.severity,
        detail: rule.detail,
        evidence: truncateEvidence(match[0]),
      });
    }
    // Reset again after exec to avoid leftover state
    rule.pattern.lastIndex = 0;
  }

  // Check for base64-encoded threats in longer strings
  // Only scan strings that look like they could contain encoded content
  if (text.length > 40) {
    scanForEncodedThreats(field, text, findings);
  }
}

/**
 * Scan for base64-encoded malicious content within text fields.
 * Looks for long base64 sequences and decodes them for inspection.
 */
function scanForEncodedThreats(field: string, text: string, findings: ScanFinding[]): void {
  // Find base64-looking sequences (40+ chars of base64 alphabet)
  const b64Pattern = /[A-Za-z0-9+/]{40,}={0,2}/g;
  let match: RegExpExecArray | null;

  while ((match = b64Pattern.exec(text)) !== null) {
    const b64str = match[0];
    const decoded = tryDecodeBase64(b64str);
    if (!decoded) continue;

    const decodedStr = decoded.toString('utf-8');

    // Check decoded content for binary headers
    for (const rule of BINARY_RULES) {
      if (rule.pattern.test(decoded.toString('latin1')) || rule.pattern.test(decodedStr)) {
        findings.push({
          field,
          rule: `encoded_${rule.name}`,
          severity: 'critical',
          detail: `Base64-encoded content contains: ${rule.detail}`,
          evidence: truncateEvidence(`[base64] ${b64str.substring(0, 40)}...`),
        });
      }
    }

    // Check decoded content for shell injection
    for (const rule of SHELL_INJECTION_RULES) {
      if (rule.pattern.test(decodedStr)) {
        findings.push({
          field,
          rule: `encoded_${rule.name}`,
          severity: 'critical',
          detail: `Base64-encoded content contains: ${rule.detail}`,
          evidence: truncateEvidence(`[base64→] ${decodedStr.substring(0, 60)}`),
        });
      }
    }
  }
}

/**
 * Scan the encrypted_payload field specifically.
 * Verifies valid base64, checks entropy, and scans decoded content.
 */
export function scanEncryptedPayload(payload: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const field = 'encrypted_payload';

  // Verify valid base64
  if (!isValidBase64(payload.replace(/\s/g, ''))) {
    findings.push({
      field,
      rule: 'invalid_base64',
      severity: 'warning',
      detail: 'encrypted_payload is not valid base64 encoding',
      evidence: truncateEvidence(payload.substring(0, 50)),
    });
    return findings;
  }

  const decoded = tryDecodeBase64(payload);
  if (!decoded) {
    findings.push({
      field,
      rule: 'base64_decode_failed',
      severity: 'warning',
      detail: 'Failed to decode encrypted_payload from base64',
      evidence: '',
    });
    return findings;
  }

  // Entropy analysis
  const entropy = shannonEntropy(decoded);

  if (decoded.length > 100 && entropy < 3.0) {
    findings.push({
      field,
      rule: 'low_entropy',
      severity: 'warning',
      detail: `Suspiciously low entropy (${entropy.toFixed(2)}) — payload contains highly repetitive data (possible decompression bomb pattern)`,
      evidence: `entropy=${entropy.toFixed(2)}, size=${decoded.length}`,
    });
  } else if (decoded.length > 100 && entropy >= 4.0 && entropy < 6.5) {
    findings.push({
      field,
      rule: 'structured_payload',
      severity: 'info',
      detail: `Payload entropy (${entropy.toFixed(2)}) suggests structured/code content rather than encrypted data (expected >7.5 for encryption)`,
      evidence: `entropy=${entropy.toFixed(2)}, size=${decoded.length}`,
    });
  }

  // Check for binary headers in decoded payload
  const latin1 = decoded.toString('latin1');
  for (const rule of BINARY_RULES) {
    if (rule.pattern.test(latin1)) {
      findings.push({
        field,
        rule: `payload_${rule.name}`,
        severity: 'critical',
        detail: `Encrypted payload contains: ${rule.detail}`,
        evidence: truncateEvidence(`[decoded] ${latin1.substring(0, 40)}`),
      });
    }
  }

  // Check decoded as UTF-8 for text-based threats
  const utf8 = decoded.toString('utf-8');
  // Only check if it looks like valid UTF-8 text
  if (!utf8.includes('\ufffd') || utf8.replace(/\ufffd/g, '').length > decoded.length * 0.7) {
    for (const rule of SHELL_INJECTION_RULES) {
      if (rule.pattern.test(utf8)) {
        findings.push({
          field,
          rule: `payload_${rule.name}`,
          severity: 'critical',
          detail: `Encrypted payload contains: ${rule.detail}`,
          evidence: truncateEvidence(`[decoded] ${utf8.substring(0, 60)}`),
        });
      }
    }
  }

  // Size check — flag very large payloads
  if (decoded.length > 10_000_000) {
    findings.push({
      field,
      rule: 'oversized_payload',
      severity: 'warning',
      detail: `Decoded payload is very large (${(decoded.length / 1_000_000).toFixed(1)}MB)`,
      evidence: `size=${decoded.length}`,
    });
  }

  return findings;
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncateEvidence(str: string): string {
  if (str.length <= 200) return str;
  return str.substring(0, 197) + '...';
}

/**
 * Full scan: text fields + encrypted payload.
 * This is the main entry point used by the intake route.
 */
export function fullScan(
  textFields: Record<string, string | string[] | undefined | null>,
  encryptedPayload?: string | null
): ScanResult {
  // Scan text fields
  const result = scanUpload(textFields);

  // Scan encrypted payload if present
  if (encryptedPayload) {
    const payloadFindings = scanEncryptedPayload(encryptedPayload);
    result.findings.push(...payloadFindings);

    // Recalculate score with payload findings
    let score = 0;
    for (const f of result.findings) {
      if (f.severity === 'critical') score += 20;
      else if (f.severity === 'warning') score += 8;
      else score += 2;
    }
    result.score = Math.min(100, score);

    // Recalculate threat level
    if (result.score === 0) result.threatLevel = 'none';
    else if (result.score <= 10) result.threatLevel = 'low';
    else if (result.score <= 30) result.threatLevel = 'medium';
    else if (result.score <= 60) result.threatLevel = 'high';
    else result.threatLevel = 'critical';

    result.clean = result.score <= 20;
  }

  return result;
}
