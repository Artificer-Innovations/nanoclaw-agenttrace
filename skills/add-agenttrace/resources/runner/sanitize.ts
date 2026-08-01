/**
 * Secret redaction + truncation for the container runner.
 * Uses @sanity-labs/secret-scan (same library as SkeinAI).
 * Installed at container/agent-runner/src/agenttrace/sanitize.ts
 *
 * Kind gating by visibility happens in observe.ts before write.
 * This sanitize always redacts/truncates; returns null only for empty summaries
 * after redaction when kind is reasoning_summary.
 */
import { redact } from '@sanity-labs/secret-scan';
import type { ActivityVisibility, AgentActivityEvent, AgentActivityKind } from './types.js';

const MAX_EVENT_TEXT_BYTES = 4_000;

const BLOCKED_KINDS_BY_VISIBILITY: Record<ActivityVisibility, Set<AgentActivityKind>> = {
  off: new Set([
    'turn_start',
    'turn_end',
    'reasoning_summary',
    'partial_text',
    'tool_start',
    'tool_progress',
    'tool_end',
    'task_progress',
    'retry',
    'error',
    'compaction',
    'keepalive',
    'runtime_status',
  ]),
  status: new Set(['reasoning_summary', 'partial_text']),
  trace: new Set(),
  trace_reasoning: new Set(),
  trace_full: new Set(),
};

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

export function sanitizeActivityEvent(
  event: AgentActivityEvent,
  visibility: ActivityVisibility = 'trace',
): AgentActivityEvent | null {
  if (visibility === 'off') return null;
  if (BLOCKED_KINDS_BY_VISIBILITY[visibility].has(event.kind)) return null;

  return {
    ...event,
    summary: truncateUtf8(redactSecrets(event.summary || '')),
    tool: event.tool ? truncateUtf8(redactSecrets(event.tool), 128) : undefined,
    phase: event.phase ? truncateUtf8(redactSecrets(event.phase), 64) : undefined,
  };
}
