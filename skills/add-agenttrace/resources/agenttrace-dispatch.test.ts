/**
 * Duck-typed dispatch ladder tests (runs after install into a NanoClaw fork).
 * Copied into NanoClaw fork `src/`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishActivity = vi.fn(async () => {});
const clearActivity = vi.fn(async () => {});
const deliver = vi.fn(async () => 'msg-1');
const setTyping = vi.fn(async () => {});

vi.mock('./channels/channel-registry.js', () => ({
  getChannelAdapterExact: vi.fn((key: string) => {
    if (key === 'web') return { publishActivity, clearActivity };
    if (key === 'telegram') return { deliver, setTyping };
    if (key === 'typing-only') return { setTyping };
    if (key === 'silent') return {};
    return undefined;
  }),
}));

vi.mock('./log.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { dispatchActivity } from './agenttrace-dispatch.js';

const baseEvent = {
  turnId: 't1',
  seq: 1,
  timestamp: new Date().toISOString(),
  kind: 'tool_start' as const,
  summary: 'Running Bash',
  tool: 'Bash',
};

describe('dispatchActivity', () => {
  beforeEach(() => {
    publishActivity.mockClear();
    clearActivity.mockClear();
    deliver.mockClear();
    setTyping.mockClear();
  });

  it('prefers publishActivity when present', async () => {
    await dispatchActivity(
      { channelType: 'web', platformId: 'lobby', threadId: 'main', instance: 'web' },
      baseEvent,
    );
    expect(publishActivity).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('calls clearActivity after publishActivity on turn_end', async () => {
    await dispatchActivity(
      { channelType: 'web', platformId: 'lobby', threadId: 'main', instance: 'web' },
      { ...baseEvent, kind: 'turn_end', summary: 'Done' },
    );
    expect(publishActivity).toHaveBeenCalledOnce();
    expect(clearActivity).toHaveBeenCalledWith('lobby', 'main', 't1');
  });

  it('falls back to sticky deliver edit/chat', async () => {
    await dispatchActivity(
      { channelType: 'telegram', platformId: 'chat-1', threadId: null, instance: 'telegram' },
      baseEvent,
    );
    expect(deliver).toHaveBeenCalled();
    expect(setTyping).not.toHaveBeenCalled();
  });

  it('falls back to setTyping', async () => {
    await dispatchActivity(
      { channelType: 'typing-only', platformId: 'x', threadId: 't', instance: 'typing-only' },
      baseEvent,
    );
    expect(setTyping).toHaveBeenCalledOnce();
  });

  it('is silent when no capabilities exist', async () => {
    await dispatchActivity(
      { channelType: 'silent', platformId: 'x', threadId: null, instance: 'silent' },
      baseEvent,
    );
    expect(publishActivity).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(setTyping).not.toHaveBeenCalled();
  });
});
