import { describe, expect, it } from 'vitest';
import { resolveAgentTraceConfig } from './agenttrace-config.js';

describe('resolveAgentTraceConfig', () => {
  it('defaults to disabled', () => {
    expect(resolveAgentTraceConfig({}).enabled).toBe(false);
  });

  it('enables on true', () => {
    const cfg = resolveAgentTraceConfig({ AGENTTRACE_ENABLED: 'true' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.defaultVisibility).toBe('trace');
    expect(cfg.silenceKeepalive).toBe(true);
  });

  it('honors visibility and silence flags', () => {
    const cfg = resolveAgentTraceConfig({
      AGENTTRACE_ENABLED: '1',
      AGENTTRACE_DEFAULT_VISIBILITY: 'trace_reasoning',
      AGENTTRACE_SILENCE_KEEPALIVE: 'false',
    });
    expect(cfg.defaultVisibility).toBe('trace_reasoning');
    expect(cfg.silenceKeepalive).toBe(false);
  });
});
