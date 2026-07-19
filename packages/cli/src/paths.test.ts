import { describe, expect, it } from 'vitest';
import {
  AGENTTRACE_BOOT_BLOCK,
  AGENTTRACE_RUNNER_BOOT_BLOCK,
  HOST_COPY_RULES,
  REQUIRED_HOST_FILES,
  REQUIRED_RUNNER_FILES,
  RUNNER_COPY_RULES,
} from './paths.js';

describe('paths', () => {
  it('keeps host copy rules aligned with required list', () => {
    expect(HOST_COPY_RULES.map((r) => r.dest)).toEqual(REQUIRED_HOST_FILES);
  });

  it('keeps runner copy rules aligned with required list', () => {
    expect(RUNNER_COPY_RULES.map((r) => r.dest)).toEqual(REQUIRED_RUNNER_FILES);
    expect(RUNNER_COPY_RULES.some((r) => r.source === 'sanitize.ts')).toBe(true);
  });

  it('boot block imports agenttrace-boot', () => {
    expect(AGENTTRACE_BOOT_BLOCK).toContain('agenttrace-boot.js');
    expect(AGENTTRACE_BOOT_BLOCK).toContain('startAgentTrace');
  });

  it('runner boot block loads hosthook registrations', () => {
    expect(AGENTTRACE_RUNNER_BOOT_BLOCK).toContain('agenttrace/register.js');
  });
});
