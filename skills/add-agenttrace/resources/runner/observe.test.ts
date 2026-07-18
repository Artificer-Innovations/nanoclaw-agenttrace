/**
 * Bun test — copied to container/agent-runner/src/agenttrace/observe.test.ts
 */
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';

const writes: unknown[] = [];

mock.module('../db/messages-out.js', () => ({
  writeMessageOut: (msg: unknown) => {
    writes.push(msg);
    return 1;
  },
}));

mock.module('../db/session-routing.js', () => ({
  getSessionRouting: () => ({
    channel_type: 'web',
    platform_id: 'lobby',
    thread_id: 'main',
  }),
}));

mock.module('../db/connection.js', () => ({
  getOutboundDb: () => ({
    prepare: () => ({
      all: () => [],
      run: () => {},
    }),
  }),
}));

beforeEach(() => {
  writes.length = 0;
  process.env.AGENTTRACE_ENABLED = 'true';
  process.env.AGENTTRACE_VISIBILITY = 'trace';
});

afterEach(() => {
  delete process.env.AGENTTRACE_VISIBILITY;
});

function lastEvent(): { kind: string; summary: string; tool?: string; phase?: string } {
  expect(writes.length).toBeGreaterThan(0);
  const content = JSON.parse((writes[writes.length - 1] as { content: string }).content);
  return content.event;
}

describe('observeClaudeSdkMessage', () => {
  it('emits tool_start for assistant tool_use blocks', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-1');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash', id: 't1' }],
      },
    });

    expect(writes.length).toBeGreaterThan(0);
    const content = JSON.parse((writes[0] as { content: string }).content);
    expect(content.action).toBe('agenttrace_activity');
    expect(content.event.kind).toBe('tool_start');
    expect(content.event.tool).toBe('Bash');
    expect(content.event.summary).toBe('Running Bash');
  });

  it('emits reasoning_summary for completed thinking blocks under trace', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-2');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'I should read the file first' }],
      },
    });

    expect(writes).toHaveLength(1);
    const ev = lastEvent();
    expect(ev.kind).toBe('reasoning_summary');
    expect(ev.summary).toBe('I should read the file first');
    expect(ev.phase).toBe('thinking');
  });

  it('does not emit reasoning under status visibility', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'status';
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-status');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'hidden plan' }],
      },
    });

    expect(writes).toHaveLength(0);
  });

  it('never forwards redacted_thinking blocks', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-redacted');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'redacted_thinking', data: 'opaque-blob' }],
      },
    });

    expect(writes).toHaveLength(0);
  });

  it('coalesces thinking_delta and flushes on content_block_stop', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-delta');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'thinking' } },
    });
    observeClaudeSdkMessage({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Step one. ' } },
    });
    observeClaudeSdkMessage({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Step two.' } },
    });
    // Not flushed yet (timer pending)
    expect(writes).toHaveLength(0);

    observeClaudeSdkMessage({
      type: 'stream_event',
      event: { type: 'content_block_stop' },
    });

    expect(writes).toHaveLength(1);
    expect(lastEvent().kind).toBe('reasoning_summary');
    expect(lastEvent().summary).toBe('Step one. Step two.');
  });

  it('flushes early when the thinking buffer hits the hard cap', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-cap');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'thinking' } },
    });
    observeClaudeSdkMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'thinking_delta', thinking: 'x'.repeat(16_000) },
      },
    });

    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(lastEvent().kind).toBe('reasoning_summary');
    expect(lastEvent().summary.length).toBeLessThanOrEqual(2000);
  });

  it('includes tool input under trace_full', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'trace_full';
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-full');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls -la' } }],
      },
    });

    expect(lastEvent().kind).toBe('tool_start');
    expect(lastEvent().summary).toBe('Bash: ls -la');
  });

  it('emits tool_end with result snippet under trace_full', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'trace_full';
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-result');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls' } }],
      },
    });
    observeClaudeSdkMessage({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file1.txt\nfile2.txt' }],
      },
    });

    expect(lastEvent().kind).toBe('tool_end');
    expect(lastEvent().tool).toBe('Bash');
    expect(lastEvent().summary).toContain('Finished:');
    expect(lastEvent().summary).toContain('file1.txt');
  });

  it('emits subagent text as task_progress under trace_full', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'trace_full';
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-sub');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'assistant',
      parent_tool_use_id: 'agent-tool-1',
      message: {
        content: [{ type: 'text', text: 'Subagent found three matches' }],
      },
    });

    expect(lastEvent().kind).toBe('task_progress');
    expect(lastEvent().phase).toBe('subagent:agent-tool-1');
    expect(lastEvent().summary).toContain('three matches');
  });

  it('redacts secrets in tool summaries before write', async () => {
    const { observeClaudeSdkMessage, beginAgentTraceTurn, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    beginAgentTraceTurn('msg-3');
    writes.length = 0;

    observeClaudeSdkMessage({
      type: 'tool_use_summary',
      summary: 'Using key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234',
    });

    expect(writes.length).toBeGreaterThan(0);
    const content = JSON.parse((writes[0] as { content: string }).content);
    expect(content.event.summary).toContain('[redacted]');
    expect(content.event.summary).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234');
  });

  it('agentTraceQueryOptions requests summarized thinking under trace', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'trace';
    const { agentTraceQueryOptions, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    expect(agentTraceQueryOptions()).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
    });
  });

  it('agentTraceQueryOptions enables forwardSubagentText under trace_full', async () => {
    process.env.AGENTTRACE_VISIBILITY = 'trace_full';
    const { agentTraceQueryOptions, refreshAgentTraceVisibility } = await import('./observe.js');
    refreshAgentTraceVisibility();
    expect(agentTraceQueryOptions()).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
      forwardSubagentText: true,
    });
  });

  it('registers the global bridge for the claude.ts sdkopts splice on import', async () => {
    // The sdkopts splice builds options synchronously and reads this global
    // instead of require()-ing ESM observe.js (issue #7).
    const { agentTraceQueryOptions } = await import('./observe.js');
    const bridge = Reflect.get(globalThis, '__nanoclawAgentTraceQueryOptions');
    expect(bridge).toBe(agentTraceQueryOptions);
    process.env.AGENTTRACE_VISIBILITY = 'trace';
    expect((bridge as () => object)()).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
    });
  });
});
