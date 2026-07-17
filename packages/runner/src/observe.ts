/**
 * Claude SDK message → activity events (container side).
 * Installed at container/agent-runner/src/agenttrace/observe.ts
 *
 * Called from a surgical marker patch inside providers/claude.ts translateEvents.
 */
import { writeActivityEvent } from './writer.js';
import type { AgentActivityKind } from './types.js';

let turnId = `turn-${Date.now()}`;
let seq = 0;
let visibility: 'off' | 'status' | 'trace' | 'trace_reasoning' = readVisibility();

/**
 * Fail-closed: emit nothing unless AGENTTRACE_ENABLED is truthy.
 * Visibility then narrows what is emitted (status | trace | …).
 * Reasoning summaries are deferred past 0.1.0 — never emitted here yet.
 */
function readVisibility(): 'off' | 'status' | 'trace' | 'trace_reasoning' {
  const enabled = (process.env.AGENTTRACE_ENABLED || '').trim().toLowerCase();
  if (enabled !== '1' && enabled !== 'true' && enabled !== 'yes') return 'off';

  const raw = (process.env.AGENTTRACE_VISIBILITY || process.env.AGENTTRACE_DEFAULT_VISIBILITY || 'trace')
    .trim()
    .toLowerCase();
  if (raw === 'off' || raw === 'status' || raw === 'trace' || raw === 'trace_reasoning') return raw;
  return 'trace';
}

export function setAgentTraceTurnId(id: string): void {
  turnId = id;
  seq = 0;
}

export function refreshAgentTraceVisibility(): void {
  visibility = readVisibility();
}

function nextSeq(): number {
  seq += 1;
  return seq;
}

function emit(kind: AgentActivityKind, summary: string, extra?: { tool?: string; phase?: string }): void {
  if (visibility === 'off') return;
  if (visibility === 'status' && (kind === 'reasoning_summary' || kind === 'partial_text')) return;
  // 0.1.0: never forward raw thinking (even under trace_reasoning).
  if (kind === 'reasoning_summary') return;

  writeActivityEvent({
    turnId,
    seq: nextSeq(),
    timestamp: new Date().toISOString(),
    kind,
    summary: summary.slice(0, 4000),
    tool: extra?.tool,
    phase: extra?.phase,
    replaceKey: `turn:${turnId}`,
  });
}

/**
 * Observe one Claude Agent SDK message. Best-effort; never throws to caller.
 */
export function observeClaudeSdkMessage(message: unknown): void {
  try {
    if (visibility === 'off') return;
    if (!message || typeof message !== 'object') return;
    const m = message as Record<string, unknown>;
    const type = m.type;

    if (type === 'assistant') {
      const content = (m.message as { content?: unknown[] } | undefined)?.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        // reasoning_summary deferred past 0.1.0 — skip thinking blocks.
        if (b.type === 'thinking') {
          continue;
        } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          emit('partial_text', b.text.trim().slice(0, 500));
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          emit('tool_start', `Running ${b.name}`, { tool: b.name, phase: 'tool' });
        }
      }
      return;
    }

    if (type === 'stream_event') {
      const event = m.event as Record<string, unknown> | undefined;
      if (!event) return;
      if (event.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'thinking_delta') {
          // deferred past 0.1.0
        } else if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
          emit('partial_text', delta.text.slice(0, 300));
        }
      }
      return;
    }

    if (type === 'tool_progress') {
      const toolName = typeof m.tool_name === 'string' ? m.tool_name : 'tool';
      const elapsed = typeof m.elapsed_time_seconds === 'number' ? m.elapsed_time_seconds : undefined;
      emit(
        'tool_progress',
        elapsed != null ? `${toolName} (${elapsed}s)` : toolName,
        { tool: toolName, phase: 'tool' },
      );
      return;
    }

    if (type === 'tool_use_summary' && typeof m.summary === 'string') {
      emit('task_progress', m.summary.slice(0, 500), { phase: 'task' });
      return;
    }

    if (type === 'system') {
      const subtype = m.subtype;
      if (subtype === 'task_notification' || subtype === 'task_progress' || subtype === 'task_updated') {
        const summary =
          (typeof m.summary === 'string' && m.summary) ||
          (typeof m.description === 'string' && m.description) ||
          'Task update';
        emit('task_progress', summary.slice(0, 500), { phase: 'task' });
      } else if (subtype === 'compact_boundary') {
        emit('compaction', 'Context compacted');
      } else if (subtype === 'api_retry') {
        emit('retry', 'API retry');
      }
      return;
    }

    if (type === 'result') {
      emit('turn_end', 'Done');
    }
  } catch {
    // never break the provider stream
  }
}

/** Mark a new user turn (call when processing a new inbound batch). */
export function beginAgentTraceTurn(inboundId?: string): void {
  setAgentTraceTurnId(inboundId || `turn-${Date.now()}`);
  emit('turn_start', 'Working…');
}
