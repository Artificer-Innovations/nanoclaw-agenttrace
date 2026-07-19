/**
 * Claude SDK message → activity events (container side).
 * Installed at container/agent-runner/src/agenttrace/observe.ts
 *
 * Called from a surgical marker patch inside providers/claude.ts translateEvents.
 *
 * 0.2.0: forwards Anthropic summarized thinking under `trace` (default) and
 * richer tool/subagent detail under `trace_full`. Never forwards signatures
 * or redacted_thinking payloads. Raw CoT is not available from the API.
 */
import { writeActivityEvent, setWriterVisibility } from './writer.js';
import {
  THINKING_COALESCE_FULL_MS,
  THINKING_COALESCE_MS,
  type ActivityVisibility,
  type AgentActivityKind,
} from './types.js';

let turnId = `turn-${Date.now()}`;
let seq = 0;
let visibility: ActivityVisibility = readVisibility();

let thinkingBuf = '';
let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
/** True while the current stream content block is a thinking block. */
let streamingThinking = false;
/** tool_use id → name so tool_end can pair with tool_start in the UI. */
const toolNamesById = new Map<string, string>();
/** Hard cap on coalesced thinking before an early flush (malformed streams). */
const MAX_THINKING_BUF_CHARS = 16_000;

/**
 * Fail-closed: emit nothing unless AGENTTRACE_ENABLED is truthy.
 * Visibility then narrows what is emitted (status | trace | trace_full | …).
 */
function readVisibility(): ActivityVisibility {
  const enabled = (process.env.AGENTTRACE_ENABLED || '').trim().toLowerCase();
  if (enabled !== '1' && enabled !== 'true' && enabled !== 'yes') return 'off';

  const raw = (process.env.AGENTTRACE_VISIBILITY || process.env.AGENTTRACE_DEFAULT_VISIBILITY || 'trace')
    .trim()
    .toLowerCase();
  if (
    raw === 'off' ||
    raw === 'status' ||
    raw === 'trace' ||
    raw === 'trace_reasoning' ||
    raw === 'trace_full'
  ) {
    return raw;
  }
  return 'trace';
}

function includesReasoning(v: ActivityVisibility): boolean {
  return v === 'trace' || v === 'trace_reasoning' || v === 'trace_full';
}

function isFull(v: ActivityVisibility): boolean {
  return v === 'trace_full';
}

export function setAgentTraceTurnId(id: string): void {
  turnId = id;
  seq = 0;
}

export function refreshAgentTraceVisibility(): void {
  visibility = readVisibility();
  setWriterVisibility(visibility);
}

function nextSeq(): number {
  seq += 1;
  return seq;
}

function clearThinkingTimer(): void {
  if (thinkingTimer) {
    clearTimeout(thinkingTimer);
    thinkingTimer = null;
  }
}

function flushThinkingBuffer(): void {
  clearThinkingTimer();
  const text = thinkingBuf.trim();
  thinkingBuf = '';
  if (!text) return;
  if (!includesReasoning(visibility)) return;
  const cap = isFull(visibility) ? 4000 : 2000;
  emit('reasoning_summary', text.slice(0, cap), { phase: 'thinking' });
}

function appendThinkingDelta(chunk: string): void {
  if (!includesReasoning(visibility)) return;
  if (!chunk) return;
  thinkingBuf += chunk;
  if (thinkingBuf.length >= MAX_THINKING_BUF_CHARS) {
    flushThinkingBuffer();
    return;
  }
  const wait = isFull(visibility) ? THINKING_COALESCE_FULL_MS : THINKING_COALESCE_MS;
  if (thinkingTimer) return;
  thinkingTimer = setTimeout(() => {
    thinkingTimer = null;
    flushThinkingBuffer();
  }, wait);
}

function emit(kind: AgentActivityKind, summary: string, extra?: { tool?: string; phase?: string }): void {
  if (visibility === 'off') return;
  if (visibility === 'status' && (kind === 'reasoning_summary' || kind === 'partial_text')) return;

  const cap = isFull(visibility) ? 4000 : kind === 'reasoning_summary' ? 2000 : 500;
  writeActivityEvent({
    turnId,
    seq: nextSeq(),
    timestamp: new Date().toISOString(),
    kind,
    summary: summary.slice(0, cap),
    tool: extra?.tool,
    phase: extra?.phase,
    replaceKey: `turn:${turnId}`,
  });
}

function formatToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return `Running ${name}`;
  const o = input as Record<string, unknown>;
  if (typeof o.command === 'string' && o.command.trim()) return `${name}: ${o.command.trim()}`;
  if (typeof o.cmd === 'string' && o.cmd.trim()) return `${name}: ${o.cmd.trim()}`;
  if (typeof o.file_path === 'string') return `${name}: ${o.file_path}`;
  if (typeof o.path === 'string') return `${name}: ${o.path}`;
  if (typeof o.pattern === 'string') return `${name}: ${o.pattern}`;
  if (typeof o.query === 'string') return `${name}: ${o.query}`;
  if (typeof o.prompt === 'string') return `${name}: ${o.prompt.slice(0, 300)}`;
  try {
    return `${name}: ${JSON.stringify(input).slice(0, 500)}`;
  } catch {
    return `Running ${name}`;
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string') return p.text;
        if (typeof p.content === 'string') return p.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parentToolUseId(message: Record<string, unknown>): string | undefined {
  const id = message.parent_tool_use_id;
  return typeof id === 'string' && id ? id : undefined;
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
    const parentId = parentToolUseId(m);

    if (type === 'assistant') {
      const content = (m.message as { content?: unknown[] } | undefined)?.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;

        // Never forward encrypted / opaque thinking payloads.
        if (b.type === 'redacted_thinking') continue;
        if (b.type === 'thinking') {
          // Completed thinking block — Anthropic summarized text when display=summarized.
          const text = typeof b.thinking === 'string' ? b.thinking.trim() : '';
          if (text && includesReasoning(visibility)) {
            flushThinkingBuffer();
            if (parentId && isFull(visibility)) {
              emit('task_progress', text.slice(0, 2000), { phase: `subagent:${parentId}` });
            } else {
              emit('reasoning_summary', text.slice(0, isFull(visibility) ? 4000 : 2000), {
                phase: 'thinking',
              });
            }
          }
          continue;
        }

        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          const text = b.text.trim();
          if (parentId && isFull(visibility)) {
            emit('task_progress', text.slice(0, isFull(visibility) ? 2000 : 500), {
              phase: `subagent:${parentId}`,
            });
          } else {
            emit('partial_text', text.slice(0, isFull(visibility) ? 2000 : 500));
          }
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          if (typeof b.id === 'string' && b.id) toolNamesById.set(b.id, b.name);
          if (isFull(visibility)) {
            emit('tool_start', formatToolInput(b.name, b.input), { tool: b.name, phase: 'tool' });
          } else {
            emit('tool_start', `Running ${b.name}`, { tool: b.name, phase: 'tool' });
          }
        }
      }
      return;
    }

    if (type === 'user' && isFull(visibility)) {
      const content = (m.message as { content?: unknown[] } | undefined)?.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        if (b.type !== 'tool_result') continue;
        const text = toolResultText(b.content).trim();
        const isError = b.is_error === true;
        const snippet = text.slice(0, 2000);
        const summary = isError
          ? `Tool error${snippet ? `: ${snippet}` : ''}`
          : snippet
            ? `Finished: ${snippet}`
            : 'Finished tool';
        emit('tool_end', summary, {
          tool:
            typeof b.tool_use_id === 'string'
              ? (toolNamesById.get(b.tool_use_id) ?? b.tool_use_id)
              : undefined,
          phase: 'tool',
        });
        if (typeof b.tool_use_id === 'string') toolNamesById.delete(b.tool_use_id);
      }
      return;
    }

    if (type === 'stream_event') {
      const event = m.event as Record<string, unknown> | undefined;
      if (!event) return;

      if (event.type === 'content_block_start') {
        const block = event.content_block as Record<string, unknown> | undefined;
        streamingThinking = block?.type === 'thinking';
        return;
      }

      if (event.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          // Summarized thinking stream (never signature_delta / redacted).
          appendThinkingDelta(delta.thinking);
        } else if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
          emit('partial_text', delta.text.slice(0, isFull(visibility) ? 2000 : 300));
        }
        return;
      }

      if (event.type === 'content_block_stop') {
        if (streamingThinking) {
          flushThinkingBuffer();
          streamingThinking = false;
        }
        return;
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
      emit('task_progress', m.summary.slice(0, isFull(visibility) ? 2000 : 500), { phase: 'task' });
      return;
    }

    if (type === 'system') {
      const subtype = m.subtype;
      if (subtype === 'task_notification' || subtype === 'task_progress' || subtype === 'task_updated') {
        const summary =
          (typeof m.summary === 'string' && m.summary) ||
          (typeof m.description === 'string' && m.description) ||
          'Task update';
        emit('task_progress', summary.slice(0, isFull(visibility) ? 2000 : 500), { phase: 'task' });
      } else if (subtype === 'compact_boundary') {
        emit('compaction', 'Context compacted');
      } else if (subtype === 'api_retry') {
        emit('retry', 'API retry');
      }
      return;
    }

    if (type === 'result') {
      flushThinkingBuffer();
      toolNamesById.clear();
      emit('turn_end', 'Done');
    }
  } catch {
    // never break the provider stream
  }
}

/** Mark a new user turn (call when processing a new inbound batch). */
export function beginAgentTraceTurn(inboundId?: string): void {
  flushThinkingBuffer();
  toolNamesById.clear();
  setAgentTraceTurnId(inboundId || `turn-${Date.now()}`);
  emit('turn_start', 'Working…');
}

/** SDK options contributed synchronously through nanoclaw-hosthooks. */
export function agentTraceQueryOptions(): {
  thinking?: { type: 'adaptive'; display: 'summarized' };
  forwardSubagentText?: boolean;
} {
  const v = readVisibility();
  if (!includesReasoning(v)) return {};
  return {
    thinking: { type: 'adaptive', display: 'summarized' },
    ...(isFull(v) ? { forwardSubagentText: true } : {}),
  };
}
