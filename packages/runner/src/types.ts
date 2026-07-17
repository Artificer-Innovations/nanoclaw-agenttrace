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
}

export const AGENTTRACE_ACTION = 'agenttrace_activity' as const;

export const MAX_EVENTS_PER_TURN = 200;
export const MAX_COMPLETED_TURNS = 50;
