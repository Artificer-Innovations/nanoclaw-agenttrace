/**
 * Portable agent activity events — provider-neutral, privacy-aware.
 *
 * Never includes thinking signatures, redacted_thinking payloads, or credentials.
 * Under `trace_full`, summaries may include secret-scanned tool inputs/results.
 */

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
  | 'keepalive';

export interface AgentActivityEvent {
  /** Stable turn id (usually inbound message id or generated UUID). */
  turnId: string;
  /** Monotonic per-turn sequence. */
  seq: number;
  timestamp: string;
  kind: AgentActivityKind;
  /** Short safe summary for UI / channel status. */
  summary: string;
  /** Optional phase hint for renderers. */
  phase?: string;
  /** Tool name when kind is tool_* */
  tool?: string;
  /** Replacement key for edit-in-place status (e.g. turn status sticky). */
  replaceKey?: string;
  /** True when this is a silence-timer synthetic keepalive (#1440). */
  keepalive?: boolean;
  /** Display name of the agent group producing this event (enriched on host). */
  agentName?: string;
  /** Agent group folder id (enriched on host; used for multi-agent UI). */
  agentFolder?: string;
}

/** System action name registered with NanoClaw delivery. */
export const AGENTTRACE_ACTION = 'agenttrace_activity' as const;

/** Content shape written to messages_out (kind: system). */
export interface AgentTraceSystemContent {
  action: typeof AGENTTRACE_ACTION;
  event: AgentActivityEvent;
}

export const MAX_EVENTS_PER_TURN = 200;
/** Higher per-turn cap for the `trace_full` firehose. */
export const MAX_EVENTS_PER_TURN_FULL = 500;
export const MAX_EVENT_TEXT_BYTES = 4 * 1024;
export const MAX_COMPLETED_TURNS = 50;
export const PARTIAL_TEXT_MIN_INTERVAL_MS = 500;
/** Coalesce window for thinking_delta under `trace`. */
export const THINKING_COALESCE_MS = 400;
/** Faster coalesce window under `trace_full`. */
export const THINKING_COALESCE_FULL_MS = 200;

export const SILENCE_KEEPALIVE_THRESHOLDS_MS = [30_000, 90_000, 180_000] as const;
