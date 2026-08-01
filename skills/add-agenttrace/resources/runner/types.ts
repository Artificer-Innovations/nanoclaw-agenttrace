export type ActivityVisibility = 'off' | 'status' | 'trace' | 'trace_reasoning' | 'trace_full';

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
  | 'keepalive'
  | 'runtime_status';

/** Host/runtime lifecycle phases for `runtime_status` (vendor-neutral). */
export type RuntimeActivityPhase =
  | 'preparing'
  | 'waiting_transport'
  | 'configuring'
  | 'building_image'
  | 'pulling_image'
  | 'provisioning_storage'
  | 'allocating'
  | 'updating_config'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'restarting'
  | 'blocked'
  | 'crashed'
  | 'failed';

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
export const MAX_EVENTS_PER_TURN_FULL = 500;
export const MAX_COMPLETED_TURNS = 50;
export const THINKING_COALESCE_MS = 400;
export const THINKING_COALESCE_FULL_MS = 200;
