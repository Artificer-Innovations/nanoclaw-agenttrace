import {
  MAX_EVENT_TEXT_BYTES,
  type ActivityVisibility,
  type AgentActivityEvent,
  type AgentActivityKind,
} from './types.js';

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-]+\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
];

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
  ]),
  status: new Set(['reasoning_summary', 'partial_text']),
  trace: new Set(['reasoning_summary']),
  trace_reasoning: new Set(),
};

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
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
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
  if (raw === 'off' || raw === 'status' || raw === 'trace' || raw === 'trace_reasoning') {
    return raw;
  }
  return 'off';
}
