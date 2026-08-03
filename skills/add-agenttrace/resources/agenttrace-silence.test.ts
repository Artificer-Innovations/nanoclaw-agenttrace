/**
 * Silence keepalive terminal-gate tests.
 * Copied into NanoClaw fork `src/`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db/index.js', () => ({
  getActiveSessions: vi.fn(() => []),
  getAgentGroup: vi.fn(),
  getMessagingGroup: vi.fn(),
}));

vi.mock('./db/session-db.js', () => ({
  getContainerState: vi.fn(),
}));

vi.mock('./session-manager.js', () => ({
  openOutboundDb: vi.fn(),
  heartbeatPath: vi.fn(() => '/tmp/missing-heartbeat'),
}));

vi.mock('./agenttrace-dispatch.js', () => ({
  dispatchActivity: vi.fn(async () => {}),
}));

vi.mock('./log.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  isSilenceTerminal,
  noteActivitySeen,
  stopSilenceKeepalive,
} from './agenttrace-silence.js';

describe('silence keepalive terminal gate', () => {
  afterEach(() => {
    stopSilenceKeepalive();
  });

  it('suppresses keepalives after error / turn_end until non-terminal activity', () => {
    const sessionId = 'sess-stall';
    noteActivitySeen(sessionId, Date.now(), { kind: 'turn_start' });
    expect(isSilenceTerminal(sessionId)).toBe(false);

    noteActivitySeen(sessionId, Date.now(), { kind: 'error' });
    expect(isSilenceTerminal(sessionId)).toBe(true);

    noteActivitySeen(sessionId, Date.now(), { kind: 'task_progress' });
    expect(isSilenceTerminal(sessionId)).toBe(false);

    noteActivitySeen(sessionId, Date.now(), { kind: 'turn_end' });
    expect(isSilenceTerminal(sessionId)).toBe(true);
  });
});
