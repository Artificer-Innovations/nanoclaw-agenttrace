import { redact } from '@sanity-labs/secret-scan';
import {
  MAX_EVENT_TEXT_BYTES,
  type ActivityVisibility,
  type AgentActivityEvent,
  type AgentActivityKind,
} from './types.js';

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
  // Tools / tasks / keepalives / runtime status only — no reasoning or partial assistant text.
  status: new Set(['reasoning_summary', 'partial_text']),
  // Default: tools + partial text + Anthropic summarized reasoning.
  trace: new Set(),
  // Alias of `trace` (kept for API compatibility; no raw CoT mode).
  trace_reasoning: new Set(),
  // Firehose: same kinds as trace; richer summaries are gated in the observer.
  trace_full: new Set(),
};

/** Redact secrets via @sanity-labs/secret-scan (TruffleHog-derived rules; same as Skein). */
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

export function formatStatusLine(event: AgentActivityEvent): string {
  if (event.keepalive) {
    return event.summary.startsWith('Still running') ? event.summary : `Still running — ${event.summary}`;
  }
  switch (event.kind) {
    case 'tool_start':
      return event.tool ? `Running ${event.tool}` : event.summary;
    case 'tool_progress':
      return event.summary;
    case 'tool_end':
      return event.tool ? `Finished ${event.tool}` : event.summary;
    case 'task_progress':
      return event.summary;
    case 'runtime_status':
      return event.summary || 'Working…';
    case 'reasoning_summary':
      return event.summary;
    case 'partial_text':
      return event.summary;
    case 'retry':
      return `Retrying — ${event.summary}`;
    case 'error':
      return `Error — ${event.summary}`;
    case 'compaction':
      return event.summary || 'Context compacted';
    case 'turn_start':
      return 'Working…';
    case 'turn_end':
      return 'Done';
    default:
      return event.summary || 'Working…';
  }
}

export function parseVisibility(raw: unknown): ActivityVisibility {
  if (
    raw === 'off' ||
    raw === 'status' ||
    raw === 'trace' ||
    raw === 'trace_reasoning' ||
    raw === 'trace_full'
  ) {
    return raw;
  }
  return 'off';
}

/** True when Anthropic summarized thinking should be requested and forwarded. */
export function visibilityIncludesReasoning(visibility: ActivityVisibility): boolean {
  return visibility === 'trace' || visibility === 'trace_reasoning' || visibility === 'trace_full';
}

/** True when tool inputs/results and subagent transcripts should be forwarded. */
export function visibilityIsFull(visibility: ActivityVisibility): boolean {
  return visibility === 'trace_full';
}
