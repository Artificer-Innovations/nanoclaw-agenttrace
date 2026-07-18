import { describe, expect, it } from 'vitest';
import {
  formatStatusLine,
  parseVisibility,
  redactSecrets,
  sanitizeActivityEvent,
  truncateUtf8,
  visibilityIncludesReasoning,
  visibilityIsFull,
} from './sanitize.js';
import type { AgentActivityEvent } from './types.js';

function ev(partial: Partial<AgentActivityEvent> & Pick<AgentActivityEvent, 'kind' | 'summary'>): AgentActivityEvent {
  return {
    turnId: 't1',
    seq: 1,
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

describe('redactSecrets', () => {
  it('redacts GitHub and Anthropic tokens via secret-scan', () => {
    const github = 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234';
    expect(redactSecrets(github)).toContain('[redacted]');
    expect(redactSecrets(github)).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234');

    const anthropic = 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwx';
    expect(redactSecrets(anthropic)).toContain('[redacted]');
  });
});

describe('truncateUtf8', () => {
  it('truncates long strings', () => {
    const long = 'a'.repeat(5000);
    const out = truncateUtf8(long, 100);
    // ellipsis (…) is 3 UTF-8 bytes
    expect(Buffer.from(out, 'utf8').length).toBeLessThanOrEqual(103);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('sanitizeActivityEvent', () => {
  it('drops everything when visibility is off', () => {
    expect(sanitizeActivityEvent(ev({ kind: 'tool_start', summary: 'Bash', tool: 'Bash' }), 'off')).toBeNull();
  });

  it('keeps reasoning when visibility is trace (default-on)', () => {
    const out = sanitizeActivityEvent(
      ev({ kind: 'reasoning_summary', summary: 'I will check the file' }),
      'trace',
    );
    expect(out?.summary).toBe('I will check the file');
  });

  it('keeps reasoning when visibility is trace_reasoning (alias)', () => {
    const out = sanitizeActivityEvent(
      ev({ kind: 'reasoning_summary', summary: 'I will check the file' }),
      'trace_reasoning',
    );
    expect(out?.summary).toBe('I will check the file');
  });

  it('keeps reasoning when visibility is trace_full', () => {
    const out = sanitizeActivityEvent(
      ev({ kind: 'reasoning_summary', summary: 'planning next step' }),
      'trace_full',
    );
    expect(out?.summary).toBe('planning next step');
  });

  it('drops reasoning when visibility is status', () => {
    expect(
      sanitizeActivityEvent(ev({ kind: 'reasoning_summary', summary: 'thinking…' }), 'status'),
    ).toBeNull();
  });
});

describe('parseVisibility / helpers', () => {
  it('accepts trace_full', () => {
    expect(parseVisibility('trace_full')).toBe('trace_full');
  });

  it('maps unknown to off', () => {
    expect(parseVisibility('nope')).toBe('off');
  });

  it('visibilityIncludesReasoning', () => {
    expect(visibilityIncludesReasoning('trace')).toBe(true);
    expect(visibilityIncludesReasoning('trace_reasoning')).toBe(true);
    expect(visibilityIncludesReasoning('trace_full')).toBe(true);
    expect(visibilityIncludesReasoning('status')).toBe(false);
    expect(visibilityIncludesReasoning('off')).toBe(false);
  });

  it('visibilityIsFull', () => {
    expect(visibilityIsFull('trace_full')).toBe(true);
    expect(visibilityIsFull('trace')).toBe(false);
  });
});

describe('formatStatusLine', () => {
  it('formats tool start', () => {
    expect(formatStatusLine(ev({ kind: 'tool_start', summary: 'x', tool: 'Bash' }))).toBe('Running Bash');
  });

  it('formats keepalive', () => {
    expect(
      formatStatusLine(ev({ kind: 'keepalive', summary: 'Bash', keepalive: true })),
    ).toBe('Still running — Bash');
  });
});
