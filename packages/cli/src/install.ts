import fs from 'node:fs';
import path from 'node:path';
import {
  copyHostFiles,
  copyRunnerFiles,
  ensureSecretScanDependency,
  hasAgentTraceBootBlock,
  insertAgentTraceBootBlock,
  insertAgentTraceRunnerBootBlock,
  removeAgentTraceBootBlock,
  removeAgentTraceRunnerBootBlock,
  removeEnvVars,
  removeHostFiles,
  removeRunnerFiles,
  scaffoldEnv,
  syncSkillToFork,
} from './patch.js';
import { findHosthooksIssues, hosthooksInstallGuidance, requireHosthooks } from './hosthooks.js';
import {
  AGENTTRACE_RUNNER_BOOT_BLOCK,
  findNanoclawRoot,
  readPackageVersion,
  REQUIRED_HOST_FILES,
  REQUIRED_RUNNER_FILES,
} from './paths.js';

export interface InstallResult {
  root: string;
  copied: string[];
  bootPatched: boolean;
  runnerBootPatched: boolean;
  env: { created: string[]; skipped: string[] };
  secretScan: { hostAdded: boolean; runnerAdded: boolean };
  version: string;
  skillPath: string;
  webchatDetected: boolean;
}

export function runInstall(root?: string): InstallResult {
  const nanoclawRoot = root ?? findNanoclawRoot();
  console.log(`Detected NanoClaw root: ${nanoclawRoot}`);
  requireHosthooks(nanoclawRoot);
  const skillPath = syncSkillToFork(nanoclawRoot);
  const hostCopied = copyHostFiles(nanoclawRoot);
  const runnerCopied = copyRunnerFiles(nanoclawRoot);
  const bootPatched = insertAgentTraceBootBlock(nanoclawRoot);
  const runnerBootPatched = insertAgentTraceRunnerBootBlock(nanoclawRoot);
  const env = scaffoldEnv(nanoclawRoot);
  const secretScan = ensureSecretScanDependency(nanoclawRoot);
  const webchatDetected =
    fs.existsSync(path.join(nanoclawRoot, 'src/channels/web.ts')) ||
    fs.existsSync(path.join(nanoclawRoot, 'src/webchat-boot.ts'));

  return {
    root: nanoclawRoot,
    copied: [...hostCopied, ...runnerCopied],
    bootPatched,
    runnerBootPatched,
    env,
    secretScan,
    version: readPackageVersion(),
    skillPath,
    webchatDetected,
  };
}

export function runUpgrade(root?: string): InstallResult {
  return runInstall(root);
}

export function runUninstall(root?: string): {
  root: string;
  removedFiles: string[];
  bootRemoved: boolean;
  runnerBootRemoved: boolean;
  envRemoved: string[];
} {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const removedFiles = [...removeHostFiles(nanoclawRoot), ...removeRunnerFiles(nanoclawRoot)];
  const bootRemoved = removeAgentTraceBootBlock(nanoclawRoot);
  const runnerBootRemoved = removeAgentTraceRunnerBootBlock(nanoclawRoot);
  const envRemoved = removeEnvVars(nanoclawRoot);

  const skillDest = path.join(nanoclawRoot, '.claude/skills/add-agenttrace');
  if (fs.existsSync(skillDest)) {
    fs.rmSync(skillDest, { recursive: true, force: true });
    removedFiles.push('.claude/skills/add-agenttrace');
  }

  return {
    root: nanoclawRoot,
    removedFiles,
    bootRemoved,
    runnerBootRemoved,
    envRemoved,
  };
}

export function runVerify(root?: string): {
  root: string;
  ok: boolean;
  issues: string[];
} {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const hosthooksIssues = findHosthooksIssues(nanoclawRoot);
  const issues: string[] = hosthooksIssues.map(
    (issue) => `${issue}; ${hosthooksInstallGuidance()}`,
  );

  for (const rel of [...REQUIRED_HOST_FILES, ...REQUIRED_RUNNER_FILES]) {
    if (!fs.existsSync(path.join(nanoclawRoot, rel))) {
      issues.push(`missing ${rel}`);
    }
  }

  const indexPath = path.join(nanoclawRoot, 'src/index.ts');
  if (!fs.existsSync(indexPath)) {
    issues.push('missing src/index.ts');
  } else if (!hasAgentTraceBootBlock(fs.readFileSync(indexPath, 'utf8'))) {
    issues.push(
      'src/index.ts missing marked startAgentTrace() boot block (@nanoclaw-agenttrace:index-boot)',
    );
  }

  const runnerIndexPath = path.join(nanoclawRoot, 'container/agent-runner/src/index.ts');
  if (!fs.existsSync(runnerIndexPath)) {
    issues.push('missing container/agent-runner/src/index.ts');
  } else if (!fs.readFileSync(runnerIndexPath, 'utf8').includes(AGENTTRACE_RUNNER_BOOT_BLOCK)) {
    issues.push('container/agent-runner/src/index.ts missing agenttrace registration import');
  }

  return { root: nanoclawRoot, ok: issues.length === 0, issues };
}

export function printInstallNextSteps(
  result: InstallResult,
  opts: { upgraded?: boolean } = {},
): void {
  const verb = opts.upgraded ? 'Upgraded' : 'Installed';
  console.log(`${verb} nanoclaw-agenttrace@${result.version} into ${result.root}`);
  console.log(`Copied ${result.copied.length} files.`);
  console.log(`Synced skill → ${result.skillPath}`);
  if (result.env.created.length > 0) {
    console.log(`Added .env: ${result.env.created.join(', ')}`);
  }
  if (result.secretScan.hostAdded || result.secretScan.runnerAdded) {
    console.log(
      'Pinned @sanity-labs/secret-scan@1.1.0 (host + agent-runner) for activity redaction.',
    );
  }
  if (result.webchatDetected) {
    console.log('\nDetected nanoclaw-webchat — for a rich timeline UI, use a webchat build');
    console.log('with the agent activity companion (feat/agent-activity-timeline). Local: pnpm webchat:local');
  }
  console.log('\nNext steps:');
  console.log('  1. Set AGENTTRACE_ENABLED=true in .env (ships disabled / fail-closed).');
  console.log('  2. pnpm install && (cd container/agent-runner && bun install)');
  console.log('  3. pnpm run build');
  console.log('  4. ./container/build.sh   # required — runner registrations live in the image');
  console.log('  5. pnpm exec nanoclaw-agenttrace verify');
  console.log('  6. # restart your NanoClaw host service');
}
