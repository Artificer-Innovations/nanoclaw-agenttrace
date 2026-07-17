/**
 * Minimal shared helpers inlined into the host adapter so the fork does not
 * need a runtime dependency on @nanoclaw-agenttrace/shared.
 *
 * Keep in sync with packages/shared/src/{types,sanitize}.ts
 */

export type ActivityVisibility = 'off' | 'status' | 'trace' | 'trace_reasoning';

export type AgentActivityKind =
  | 'turn_start'
  | 'turn_end'
  | 'reasoning_summary'
  | 'partial_text'
  | 'tool_start'
  | 'tool_progress'
  | 'tool_end'
  | 'task_progress'
  | 'retry'
  | 'error'
  | 'compaction'
  | 'keepalive';

export interface AgentActivityEvent {
  turnId: string;
  seq: number;
  timestamp: string;
  kind: AgentActivityKind;
  summary: string;
  phase?: string;
  tool?: string;
  replaceKey?: string;
  keepalive?: boolean;
  agentName?: string;
  agentFolder?: string;
}

export const AGENTTRACE_ACTION = 'agenttrace_activity' as const;

export const SILENCE_KEEPALIVE_THRESHOLDS_MS = [30_000, 90_000, 180_000] as const;

const MAX_EVENT_TEXT_BYTES = 4_000;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-]+\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
];

export function parseVisibility(raw: unknown): ActivityVisibility {
  if (raw === 'off' || raw === 'status' || raw === 'trace' || raw === 'trace_reasoning') {
    return raw;
  }
  return 'off';
}

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

/** Defense-in-depth host sanitize (container writer also redacts). */
export function sanitizeActivityEvent(event: AgentActivityEvent): AgentActivityEvent {
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
    case 'tool_end':
      return event.tool ? `Finished ${event.tool}` : event.summary;
    case 'turn_start':
      return 'Working…';
    case 'turn_end':
      return 'Done';
    case 'retry':
      return `Retrying — ${event.summary}`;
    case 'error':
      return `Error — ${event.summary}`;
    default:
      return event.summary || 'Working…';
  }
}
