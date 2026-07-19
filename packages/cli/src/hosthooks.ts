import fs from 'node:fs';
import path from 'node:path';

const INSTALL_GUIDANCE =
  'Install nanoclaw-hosthooks first, then rebuild the host and container image.';

interface HosthooksRequirement {
  path: string;
  tokens: string[];
}

const REQUIREMENTS: HosthooksRequirement[] = [
  {
    path: 'src/hosthooks.ts',
    tokens: [
      'HOSTHOOKS_API_VERSION = 1',
      'registerContainerEnvContributor',
      'containerEnv: true',
    ],
  },
  {
    path: 'container/agent-runner/src/hosthooks.ts',
    tokens: [
      'HOSTHOOKS_API_VERSION = 1',
      'registerProviderMessageObserver',
      'registerProviderQueryOptionsContributor',
      'registerInboundBatchObserver',
      'providerMessageObserver: true',
      'providerQueryOptions: true',
      'inboundBatchObserver: true',
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
        issues.push(`${requirement.path} missing hosthooks capability ${token}`);
      }
    }
  }
  return issues;
}

export function requireHosthooks(nanoclawRoot: string): void {
  const issues = findHosthooksIssues(nanoclawRoot);
  if (issues.length === 0) return;
  throw new Error(
    `nanoclaw-hosthooks API v1 is required (${issues.join('; ')}). ${INSTALL_GUIDANCE}`,
  );
}

export function hosthooksInstallGuidance(): string {
  return INSTALL_GUIDANCE;
}
