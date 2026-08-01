/**
 * Runtime lifecycle publisher tests.
 * Copied into NanoClaw fork `src/`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchActivity, getMessagingGroup, getAgentGroup } = vi.hoisted(() => ({
  dispatchActivity: vi.fn(async (_dest?: unknown, _event?: unknown) => {}),
  getMessagingGroup: vi.fn((_id?: string) => undefined as unknown),
  getAgentGroup: vi.fn((_id?: string) => undefined as unknown),
}));

vi.mock('./agenttrace-dispatch.js', () => ({
  dispatchActivity,
}));

vi.mock('./db/index.js', () => ({
  getMessagingGroup,
  getAgentGroup,
}));

vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({})),
}));

vi.mock('./log.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { publishRuntimeActivity, resetRuntimeActivitySeq } from './agenttrace-lifecycle.js';

const session = {
  id: 'sess-1',
  agent_group_id: 'ag-1',
  messaging_group_id: 'mg-1',
  thread_id: 'main',
};

describe('publishRuntimeActivity', () => {
  beforeEach(() => {
    dispatchActivity.mockClear();
    getMessagingGroup.mockReset();
    getAgentGroup.mockReset();
    resetRuntimeActivitySeq();
    delete process.env.AGENTTRACE_ENABLED;
  });

  it('no-ops when agenttrace is disabled', async () => {
    await publishRuntimeActivity(session, {
      phase: 'preparing',
      summary: 'Starting agent…',
    });
    expect(dispatchActivity).not.toHaveBeenCalled();
  });

  it('dispatches runtime_status when enabled', async () => {
    process.env.AGENTTRACE_ENABLED = 'true';
    getMessagingGroup.mockReturnValue({
      channel_type: 'web',
      platform_id: 'lobby',
      instance: 'web',
    });
    getAgentGroup.mockReturnValue({ name: 'Main', folder: 'main' });

    await publishRuntimeActivity(session, {
      phase: 'starting',
      summary: 'Starting machine…',
    });

    expect(dispatchActivity).toHaveBeenCalledOnce();
    expect(dispatchActivity).toHaveBeenCalledWith(
      {
        channelType: 'web',
        platformId: 'lobby',
        threadId: 'main',
        instance: 'web',
      },
      expect.objectContaining({
        kind: 'runtime_status',
        phase: 'starting',
        summary: 'Starting machine…',
        turnId: 'runtime:sess-1',
        replaceKey: 'runtime:sess-1',
        agentName: 'Main',
        agentFolder: 'main',
        seq: 1,
      }),
    );
  });

  it('no-ops when messaging group is missing', async () => {
    process.env.AGENTTRACE_ENABLED = 'true';
    getMessagingGroup.mockReturnValue(undefined);

    await publishRuntimeActivity(session, {
      phase: 'failed',
      summary: "Couldn't start agent runtime",
    });
    expect(dispatchActivity).not.toHaveBeenCalled();
  });

  it('does not throw when dispatch fails', async () => {
    process.env.AGENTTRACE_ENABLED = 'true';
    getMessagingGroup.mockReturnValue({
      channel_type: 'web',
      platform_id: 'lobby',
      instance: 'web',
    });
    dispatchActivity.mockRejectedValueOnce(new Error('boom'));

    await expect(
      publishRuntimeActivity(session, {
        phase: 'preparing',
        summary: 'Starting agent…',
      }),
    ).resolves.toBeUndefined();
  });

  it('uses failed state for phase and clears seq on terminal lifecycle', async () => {
    process.env.AGENTTRACE_ENABLED = 'true';
    getMessagingGroup.mockReturnValue({
      channel_type: 'web',
      platform_id: 'lobby',
      instance: 'web',
    });

    await publishRuntimeActivity(session, {
      phase: 'starting',
      summary: 'Starting…',
    });
    await publishRuntimeActivity(session, {
      phase: 'starting',
      summary: 'Still starting…',
      state: 'failed',
    });
    expect(dispatchActivity).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'failed', seq: 2 }),
    );

    await publishRuntimeActivity(session, {
      phase: 'preparing',
      summary: 'Retry…',
    });
    expect(dispatchActivity).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'preparing', seq: 1 }),
    );
  });
});
