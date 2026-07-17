/**
 * Secret redaction + truncation for the container runner.
 * Uses @sanity-labs/secret-scan (same library as SkeinAI).
 * Installed at container/agent-runner/src/agenttrace/sanitize.ts
 */
import { redact } from '@sanity-labs/secret-scan';
import type { AgentActivityEvent } from './types.js';

const MAX_EVENT_TEXT_BYTES = 4_000;

export function redactSecrets(text: string): string {
  try {
    return redact(text, () => '[redacted]');
  } catch {
    return text;
  }
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
