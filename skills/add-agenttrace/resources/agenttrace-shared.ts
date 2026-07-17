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

export function parseVisibility(raw: unknown): ActivityVisibility {
  if (raw === 'off' || raw === 'status' || raw === 'trace' || raw === 'trace_reasoning') {
    return raw;
  }
  return 'off';
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
