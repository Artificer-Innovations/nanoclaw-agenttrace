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

  it('does not emit reasoning_summary in 0.1.0 (deferred)', async () => {
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

    expect(writes).toHaveLength(0);
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
});
