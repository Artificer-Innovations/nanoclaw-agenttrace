import { describe, expect, it } from 'vitest';
import { TurnEventCap } from './caps.js';
import { MAX_EVENTS_PER_TURN, type AgentActivityEvent } from './types.js';

function ev(kind: AgentActivityEvent['kind'], seq: number): AgentActivityEvent {
  return {
    turnId: 't1',
    seq,
    timestamp: new Date().toISOString(),
    kind,
    summary: kind,
  };
}

describe('TurnEventCap', () => {
  it('coalesces partial_text within interval', () => {
    const cap = new TurnEventCap();
    expect(cap.accept(ev('partial_text', 1), 1000)).toBe(true);
    expect(cap.accept(ev('partial_text', 2), 1100)).toBe(false);
    expect(cap.accept(ev('partial_text', 3), 1600)).toBe(true);
  });

  it('preserves tool_end after cap', () => {
    const cap = new TurnEventCap();
    for (let i = 0; i < MAX_EVENTS_PER_TURN; i += 1) {
      cap.accept(ev('task_progress', i), 10_000 + i);
    }
    expect(cap.accept(ev('task_progress', 999), 20_000)).toBe(false);
    expect(cap.accept(ev('tool_end', 1000), 20_001)).toBe(true);
  });
});
