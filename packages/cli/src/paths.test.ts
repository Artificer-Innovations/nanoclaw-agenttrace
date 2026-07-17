import { describe, expect, it } from 'vitest';
import { AGENTTRACE_BOOT_BLOCK, HOST_COPY_RULES, REQUIRED_HOST_FILES } from './paths.js';

describe('paths', () => {
  it('keeps copy rules aligned with required list', () => {
    expect(HOST_COPY_RULES.map((r) => r.dest)).toEqual(REQUIRED_HOST_FILES);
  });

  it('boot block imports agenttrace-boot', () => {
    expect(AGENTTRACE_BOOT_BLOCK).toContain('agenttrace-boot.js');
    expect(AGENTTRACE_BOOT_BLOCK).toContain('startAgentTrace');
  });
});
