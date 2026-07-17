import fs from 'node:fs';
import path from 'node:path';
import {
  copyHostFiles,
  copyRunnerFiles,
  hasAgentTraceBootBlock,
  insertAgentTraceBootBlock,
  patchClaudeProvider,
  patchPollLoop,
  removeAgentTraceBootBlock,
  removeEnvVars,
  removeHostFiles,
  removeRunnerFiles,
  scaffoldEnv,
  syncSkillToFork,
  unpatchClaudeProvider,
  unpatchPollLoop,
} from './patch.js';
import {
  findNanoclawRoot,
  readPackageVersion,
  REQUIRED_HOST_FILES,
  REQUIRED_RUNNER_FILES,
  CLAUDE_OBSERVE_MARKER_BEGIN,
} from './paths.js';

export interface InstallResult {
  root: string;
  copied: string[];
  bootPatched: boolean;
  claudePatched: boolean;
  pollPatched: boolean;
  env: { created: string[]; skipped: string[] };
  version: string;
  skillPath: string;
  webchatDetected: boolean;
}

export function runInstall(root?: string): InstallResult {
  const nanoclawRoot = root ?? findNanoclawRoot();
  console.log(`Detected NanoClaw root: ${nanoclawRoot}`);
  const skillPath = syncSkillToFork(nanoclawRoot);
  const hostCopied = copyHostFiles(nanoclawRoot);
  const runnerCopied = copyRunnerFiles(nanoclawRoot);
  const bootPatched = insertAgentTraceBootBlock(nanoclawRoot);
  const claudePatched = patchClaudeProvider(nanoclawRoot);
  const pollPatched = patchPollLoop(nanoclawRoot);
  const env = scaffoldEnv(nanoclawRoot);
  const webchatDetected =
    fs.existsSync(path.join(nanoclawRoot, 'src/channels/web.ts')) ||
    fs.existsSync(path.join(nanoclawRoot, 'src/webchat-boot.ts'));

  return {
    root: nanoclawRoot,
    copied: [...hostCopied, ...runnerCopied],
    bootPatched,
    claudePatched,
    pollPatched,
    env,
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
  claudeUnpatched: boolean;
  pollUnpatched: boolean;
  envRemoved: string[];
} {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const removedFiles = [...removeHostFiles(nanoclawRoot), ...removeRunnerFiles(nanoclawRoot)];
  const bootRemoved = removeAgentTraceBootBlock(nanoclawRoot);
  const claudeUnpatched = unpatchClaudeProvider(nanoclawRoot);
  const pollUnpatched = unpatchPollLoop(nanoclawRoot);
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
    claudeUnpatched,
    pollUnpatched,
    envRemoved,
  };
}

export function runVerify(root?: string): {
  root: string;
  ok: boolean;
  issues: string[];
} {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const issues: string[] = [];

  for (const rel of [...REQUIRED_HOST_FILES, ...REQUIRED_RUNNER_FILES]) {
    if (!fs.existsSync(path.join(nanoclawRoot, rel))) {
      issues.push(`missing ${rel}`);
    }
  }

  const indexPath = path.join(nanoclawRoot, 'src/index.ts');
  if (!fs.existsSync(indexPath)) {
    issues.push('missing src/index.ts');
  } else if (!hasAgentTraceBootBlock(fs.readFileSync(indexPath, 'utf8'))) {
    issues.push('src/index.ts missing startAgentTrace() boot block');
  }

  const claudePath = path.join(nanoclawRoot, 'container/agent-runner/src/providers/claude.ts');
  if (fs.existsSync(claudePath) && !fs.readFileSync(claudePath, 'utf8').includes(CLAUDE_OBSERVE_MARKER_BEGIN)) {
    issues.push('claude.ts missing agenttrace observe patch');
  }

  return { root: nanoclawRoot, ok: issues.length === 0, issues };
}

export function printInstallNextSteps(result: InstallResult): void {
  console.log(`Installed nanoclaw-agenttrace@${result.version} into ${result.root}`);
  console.log(`Copied ${result.copied.length} files.`);
  console.log(`Synced skill → ${result.skillPath}`);
  if (result.env.created.length > 0) {
    console.log(`Added .env: ${result.env.created.join(', ')}`);
  }
  if (result.webchatDetected) {
    console.log('\nDetected nanoclaw-webchat — for a rich timeline UI, use webchat ≥ 0.3.2');
    console.log('(per-agent live rows + typing bubbles). Local: pnpm webchat:local');
  }
  console.log('\nNext steps:');
  console.log('  1. Set AGENTTRACE_ENABLED=true in .env (ships disabled / fail-closed).');
  console.log('  2. pnpm run build');
  console.log('  3. ./container/build.sh   # required — runner patches live in the image');
  console.log('  4. pnpm exec nanoclaw-agenttrace verify');
  console.log('  5. # restart your NanoClaw host service');
}
