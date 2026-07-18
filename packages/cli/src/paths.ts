import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function packageRoot(startDir: string = __dirname): string {
  let dir = startDir;
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === 'nanoclaw-agenttrace') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate nanoclaw-agenttrace package root');
}

export function skillDir(startDir: string = __dirname): string {
  return path.join(packageRoot(startDir), 'skills/add-agenttrace');
}

export function hostSrcDir(startDir: string = __dirname): string {
  return path.join(packageRoot(startDir), 'packages/host/src');
}

export function runnerSrcDir(startDir: string = __dirname): string {
  return path.join(packageRoot(startDir), 'packages/runner/src');
}

export function resourcesDir(startDir: string = __dirname, nanoclawRoot?: string): string {
  const hostSrc = hostSrcDir(startDir);
  if (fs.existsSync(path.join(hostSrc, 'agenttrace-boot.ts'))) {
    return hostSrc;
  }
  if (nanoclawRoot) {
    const linked = resolveLinkedHostSrc(nanoclawRoot);
    if (linked) return linked;
  }
  return path.join(skillDir(startDir), 'resources');
}

export function runnerResourcesDir(startDir: string = __dirname, nanoclawRoot?: string): string {
  const runnerSrc = runnerSrcDir(startDir);
  if (fs.existsSync(path.join(runnerSrc, 'observe.ts'))) {
    return runnerSrc;
  }
  if (nanoclawRoot) {
    const linked = resolveLinkedRunnerSrc(nanoclawRoot);
    if (linked) return linked;
  }
  return path.join(skillDir(startDir), 'resources/runner');
}

function resolveLinkedHostSrc(nanoclawRoot: string): string | null {
  const linkedRoot = resolveLinkedRoot(nanoclawRoot);
  if (!linkedRoot) return null;
  const hostSrc = path.join(linkedRoot, 'packages/host/src');
  return fs.existsSync(path.join(hostSrc, 'agenttrace-boot.ts')) ? hostSrc : null;
}

function resolveLinkedRunnerSrc(nanoclawRoot: string): string | null {
  const linkedRoot = resolveLinkedRoot(nanoclawRoot);
  if (!linkedRoot) return null;
  const runnerSrc = path.join(linkedRoot, 'packages/runner/src');
  return fs.existsSync(path.join(runnerSrc, 'observe.ts')) ? runnerSrc : null;
}

function resolveLinkedRoot(nanoclawRoot: string): string | null {
  const pkgPath = path.join(nanoclawRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dep =
    pkg.dependencies?.['nanoclaw-agenttrace'] ?? pkg.devDependencies?.['nanoclaw-agenttrace'];
  if (!dep?.startsWith('file:')) return null;
  return path.resolve(nanoclawRoot, dep.slice('file:'.length));
}

export interface CopyRule {
  source: string;
  dest: string;
}

export const HOST_COPY_RULES: CopyRule[] = [
  { source: 'agenttrace-shared.ts', dest: 'src/agenttrace-shared.ts' },
  { source: 'agenttrace-config.ts', dest: 'src/agenttrace-config.ts' },
  { source: 'agenttrace-dispatch.ts', dest: 'src/agenttrace-dispatch.ts' },
  { source: 'agenttrace-delivery.ts', dest: 'src/agenttrace-delivery.ts' },
  { source: 'agenttrace-silence.ts', dest: 'src/agenttrace-silence.ts' },
  { source: 'agenttrace-boot.ts', dest: 'src/agenttrace-boot.ts' },
  { source: 'agenttrace-env.ts', dest: 'src/agenttrace-env.ts' },
];

export const HOST_OPTIONAL_COPY_RULES: CopyRule[] = [
  { source: 'agenttrace-config.test.ts', dest: 'src/agenttrace-config.test.ts' },
  { source: 'agenttrace-wiring.test.ts', dest: 'src/agenttrace-wiring.test.ts' },
  { source: 'agenttrace-dispatch.test.ts', dest: 'src/agenttrace-dispatch.test.ts' },
  { source: 'agenttrace-env.test.ts', dest: 'src/agenttrace-env.test.ts' },
];

export const RUNNER_COPY_RULES: CopyRule[] = [
  { source: 'types.ts', dest: 'container/agent-runner/src/agenttrace/types.ts' },
  { source: 'sanitize.ts', dest: 'container/agent-runner/src/agenttrace/sanitize.ts' },
  { source: 'writer.ts', dest: 'container/agent-runner/src/agenttrace/writer.ts' },
  { source: 'observe.ts', dest: 'container/agent-runner/src/agenttrace/observe.ts' },
  { source: 'poll-hook.ts', dest: 'container/agent-runner/src/agenttrace/poll-hook.ts' },
];

export const RUNNER_OPTIONAL_COPY_RULES: CopyRule[] = [
  { source: 'observe.test.ts', dest: 'container/agent-runner/src/agenttrace/observe.test.ts' },
];

export const AGENTTRACE_BOOT_BLOCK = `  const { startAgentTrace } = await import('./agenttrace-boot.js');
  await startAgentTrace();`;

export const REQUIRED_HOST_FILES = HOST_COPY_RULES.map((r) => r.dest);
export const REQUIRED_RUNNER_FILES = RUNNER_COPY_RULES.map((r) => r.dest);

/** Marker comments for surgical claude.ts patch */
export const CLAUDE_OBSERVE_MARKER_BEGIN = '// @nanoclaw-agenttrace-observe-begin';
export const CLAUDE_OBSERVE_MARKER_END = '// @nanoclaw-agenttrace-observe-end';
export const CLAUDE_PARTIAL_MARKER_BEGIN = '// @nanoclaw-agenttrace-partial-begin';
export const CLAUDE_PARTIAL_MARKER_END = '// @nanoclaw-agenttrace-partial-end';
export const CLAUDE_SDKOPTS_MARKER_BEGIN = '// @nanoclaw-agenttrace-sdkopts-begin';
export const CLAUDE_SDKOPTS_MARKER_END = '// @nanoclaw-agenttrace-sdkopts-end';
export const POLL_HOOK_MARKER_BEGIN = '// @nanoclaw-agenttrace-poll-begin';
export const POLL_HOOK_MARKER_END = '// @nanoclaw-agenttrace-poll-end';
export const CONTAINER_ENV_MARKER_BEGIN = '// @nanoclaw-agenttrace-env-begin';
export const CONTAINER_ENV_MARKER_END = '// @nanoclaw-agenttrace-env-end';

export function findNanoclawRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    const channelsIndex = path.join(dir, 'src/channels/index.ts');
    const hostIndex = path.join(dir, 'src/index.ts');
    if (fs.existsSync(channelsIndex) && fs.existsSync(hostIndex)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'NanoClaw root not found (expected src/channels/index.ts and src/index.ts). Use --path.',
  );
}

export function readPackageVersion(): string {
  const pkgPath = path.join(packageRoot(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
