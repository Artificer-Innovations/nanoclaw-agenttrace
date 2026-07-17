/**
 * Bun test — copied to container/agent-runner/src/agenttrace/observe.test.ts
 */
import { describe, expect, it, mock, beforeEach } from 'bun:test';

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
  process.env.AGENTTRACE_VISIBILITY = 'trace_reasoning';
});

describe('observeClaudeSdkMessage', () => {
  it('emits tool_start for assistant tool_use blocks', async () => {
    // Re-import after env set
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
  });

  it('emits reasoning_summary when visibility allows', async () => {
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

    const kinds = writes.map((w) => JSON.parse((w as { content: string }).content).event.kind);
    expect(kinds).toContain('reasoning_summary');
  });
});
