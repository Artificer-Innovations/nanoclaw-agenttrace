import fs from 'node:fs';
import path from 'node:path';

/** Pinned contract — keep in sync with nanoclaw-hosthooks API version 1. */
export const EXPECTED_HOSTHOOKS_API_VERSION = 1 as const;

const INSTALL_GUIDANCE =
  'Install nanoclaw-hosthooks@^0.1.0 (API v1) first, then rebuild the host and container image. ' +
  'See https://github.com/Artificer-Innovations/nanoclaw-hosthooks';

interface HosthooksRequirement {
  path: string;
  tokens: string[];
}

const REQUIREMENTS: HosthooksRequirement[] = [
  {
    path: 'src/hosthooks.ts',
    tokens: [
      `HOSTHOOKS_API_VERSION = ${EXPECTED_HOSTHOOKS_API_VERSION}`,
      'registerContainerEnvContributor',
      'containerEnv: true',
      'probeHosthooksCapabilities',
    ],
  },
  {
    path: 'container/agent-runner/src/hosthooks.ts',
    tokens: [
      `HOSTHOOKS_API_VERSION = ${EXPECTED_HOSTHOOKS_API_VERSION}`,
      'registerProviderMessageObserver',
      'registerProviderQueryOptionsContributor',
      'registerInboundBatchObserver',
      'providerMessageObserver: true',
      'providerQueryOptions: true',
      'inboundBatchObserver: true',
      'probeHosthooksCapabilities',
    ],
  },
  {
    path: 'src/container-runner.ts',
    tokens: ['@nanoclaw-hosthooks:container-env:begin'],
  },
  {
    path: 'container/agent-runner/src/providers/claude.ts',
    tokens: [
      '@nanoclaw-hosthooks:claude-query-options:begin',
      '@nanoclaw-hosthooks:claude-observer:begin',
    ],
  },
  {
    path: 'container/agent-runner/src/poll-loop.ts',
    tokens: ['@nanoclaw-hosthooks:poll-observer:begin'],
  },
];

export function findHosthooksIssues(nanoclawRoot: string): string[] {
  const issues: string[] = [];
  for (const requirement of REQUIREMENTS) {
    const filePath = path.join(nanoclawRoot, requirement.path);
    if (!fs.existsSync(filePath)) {
      issues.push(`missing hosthooks file ${requirement.path}`);
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    for (const token of requirement.tokens) {
      if (!source.includes(token)) {
        issues.push(
          `${requirement.path} missing hosthooks API v${EXPECTED_HOSTHOOKS_API_VERSION} capability ${token}`,
        );
      }
    }
  }
  return issues;
}

export function requireHosthooks(nanoclawRoot: string): void {
  const issues = findHosthooksIssues(nanoclawRoot);
  if (issues.length === 0) return;
  throw new Error(
    `nanoclaw-hosthooks API v${EXPECTED_HOSTHOOKS_API_VERSION} is required (${issues.join('; ')}). ${INSTALL_GUIDANCE}`,
  );
}

export function hosthooksInstallGuidance(): string {
  return INSTALL_GUIDANCE;
}
