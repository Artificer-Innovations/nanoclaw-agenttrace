import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete process.env.AGENTTRACE_ENABLED;
  delete process.env.AGENTTRACE_VISIBILITY;
  vi.resetModules();
});

describe('agenttrace hosthook registration', () => {
  it('registers one synchronous observer/contributor for each runner hook', async () => {
    const hosthooks = await import('../hosthooks.js');
    hosthooks.resetHosthooksForTests();
    await import('./register.js');

    expect(hosthooks.getHosthooksCapabilities().counts).toEqual({
      providerMessageObserver: 1,
      providerQueryOptions: 1,
      inboundBatchObserver: 1,
    });
    expect(
      hosthooks.runProviderQueryOptionsContributors({ provider: 'claude' }),
    ).toEqual({ includePartialMessages: true });
  });

  it('contributes summarized thinking options when trace is enabled', async () => {
    process.env.AGENTTRACE_ENABLED = 'true';
    process.env.AGENTTRACE_VISIBILITY = 'trace';
    const hosthooks = await import('../hosthooks.js');
    hosthooks.resetHosthooksForTests();
    await import('./register.js');

    expect(
      hosthooks.runProviderQueryOptionsContributors({ provider: 'claude' }),
    ).toEqual({
      includePartialMessages: true,
      thinking: { type: 'adaptive', display: 'summarized' },
    });
  });
});
