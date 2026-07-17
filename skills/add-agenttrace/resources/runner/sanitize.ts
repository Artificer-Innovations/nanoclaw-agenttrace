/**
 * Inlined secret redaction + truncation for the container runner.
 * Keep in sync with packages/shared/src/sanitize.ts (no runtime shared dep in Bun tree).
 */
import type { AgentActivityEvent } from './types.js';

const MAX_EVENT_TEXT_BYTES = 4_000;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-]+\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[redacted]');
  }
  return out;
}

export function truncateUtf8(text: string, maxBytes: number = MAX_EVENT_TEXT_BYTES): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end -= 1;
  return `${buf.subarray(0, end).toString('utf8')}…`;
}

export function sanitizeActivityEvent(event: AgentActivityEvent): AgentActivityEvent {
  return {
    ...event,
    summary: truncateUtf8(redactSecrets(event.summary || '')),
    tool: event.tool ? truncateUtf8(redactSecrets(event.tool), 128) : undefined,
    phase: event.phase ? truncateUtf8(redactSecrets(event.phase), 64) : undefined,
  };
}
