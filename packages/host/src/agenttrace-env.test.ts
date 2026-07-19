import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({})),
}));

import { readEnvFile } from './env.js';
import { agentTraceContainerEnv } from './agenttrace-env.js';

describe('agentTraceContainerEnv', () => {
  beforeEach(() => {
    vi.mocked(readEnvFile).mockReturnValue({});
  });

  it('forwards enabled + visibility from process env', () => {
    expect(
      agentTraceContainerEnv(
        {
          AGENTTRACE_ENABLED: 'true',
          AGENTTRACE_DEFAULT_VISIBILITY: 'trace',
        },
        {},
      ),
    ).toEqual({
      AGENTTRACE_ENABLED: 'true',
      AGENTTRACE_DEFAULT_VISIBILITY: 'trace',
    });
  });

  it('prefers process env over file env and skips blanks', () => {
    expect(
      agentTraceContainerEnv(
        { AGENTTRACE_ENABLED: 'true', AGENTTRACE_VISIBILITY: '  ' },
        { AGENTTRACE_ENABLED: 'false', AGENTTRACE_DEFAULT_VISIBILITY: 'status' },
      ),
    ).toEqual({
      AGENTTRACE_ENABLED: 'true',
      AGENTTRACE_DEFAULT_VISIBILITY: 'status',
    });
  });

  it('reads from .env via readEnvFile when process env is empty', () => {
    vi.mocked(readEnvFile).mockReturnValue({ AGENTTRACE_ENABLED: 'true' });
    expect(agentTraceContainerEnv({})).toEqual({ AGENTTRACE_ENABLED: 'true' });
  });

  it('returns empty when nothing is set', () => {
    expect(agentTraceContainerEnv({}, {})).toEqual({});
  });
});
