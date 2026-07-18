import fs from 'node:fs';
import path from 'node:path';
import {
  AGENTTRACE_BOOT_BLOCK,
  CLAUDE_OBSERVE_MARKER_BEGIN,
  CLAUDE_OBSERVE_MARKER_END,
  CLAUDE_PARTIAL_MARKER_BEGIN,
  CLAUDE_PARTIAL_MARKER_END,
  CLAUDE_SDKOPTS_MARKER_BEGIN,
  CLAUDE_SDKOPTS_MARKER_END,
  CONTAINER_ENV_MARKER_BEGIN,
  CONTAINER_ENV_MARKER_END,
  HOST_COPY_RULES,
  HOST_OPTIONAL_COPY_RULES,
  POLL_HOOK_MARKER_BEGIN,
  POLL_HOOK_MARKER_END,
  RUNNER_COPY_RULES,
  RUNNER_OPTIONAL_COPY_RULES,
  resourcesDir,
  runnerResourcesDir,
  skillDir,
} from './paths.js';

export const SCAFFOLDED_ENV_KEYS = [
  'AGENTTRACE_ENABLED',
  'AGENTTRACE_DEFAULT_VISIBILITY',
  'AGENTTRACE_SILENCE_KEEPALIVE',
] as const;

const BOOT_BLOCK_PATTERN =
  /^[ \t]*const \{ startAgentTrace \} = await import\('\.\/agenttrace-boot\.js'\);\r?\n^[ \t]*await startAgentTrace\(\);\r?\n(?:\r?\n)?/m;

export function findAgentTraceBootInsertIndex(content: string): number {
  const afterAdmin = content.match(/^[ \t]*await startAdminApi\(\);\r?\n/m);
  if (afterAdmin?.index != null) return afterAdmin.index + afterAdmin[0].length;

  const afterCli = content.match(/^[ \t]*await startCliServer\(\);\r?\n/m);
  if (afterCli?.index != null) return afterCli.index + afterCli[0].length;

  const awaited = content.match(/^\s+await initChannelAdapters\(/m);
  if (awaited?.index != null) return awaited.index;

  const plain = content.match(/^\s+initChannelAdapters\(/m);
  if (plain?.index != null) return plain.index;

  return -1;
}

export function hasAgentTraceBootBlock(content: string): boolean {
  return BOOT_BLOCK_PATTERN.test(content);
}

export function copyHostFiles(nanoclawRoot: string, resources?: string): string[] {
  const resolved = resources ?? resourcesDir(undefined, nanoclawRoot);
  const missing = HOST_COPY_RULES.filter((r) => !fs.existsSync(path.join(resolved, r.source))).map(
    (r) => r.source,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing host resources: ${missing.join(', ')}. Run pnpm run build in nanoclaw-agenttrace.`,
    );
  }

  const copied: string[] = [];
  for (const rule of [...HOST_COPY_RULES, ...HOST_OPTIONAL_COPY_RULES]) {
    const from = path.join(resolved, rule.source);
    if (!fs.existsSync(from)) continue;
    const to = path.join(nanoclawRoot, rule.dest);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(rule.dest);
  }
  return copied;
}

export function copyRunnerFiles(nanoclawRoot: string, resources?: string): string[] {
  const resolved = resources ?? runnerResourcesDir(undefined, nanoclawRoot);
  const missing = RUNNER_COPY_RULES.filter((r) => !fs.existsSync(path.join(resolved, r.source))).map(
    (r) => r.source,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing runner resources: ${missing.join(', ')}. Run pnpm run build in nanoclaw-agenttrace.`,
    );
  }

  const copied: string[] = [];
  for (const rule of [...RUNNER_COPY_RULES, ...RUNNER_OPTIONAL_COPY_RULES]) {
    const from = path.join(resolved, rule.source);
    if (!fs.existsSync(from)) continue;
    const to = path.join(nanoclawRoot, rule.dest);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(rule.dest);
  }
  return copied;
}

export function insertAgentTraceBootBlock(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'src/index.ts');
  const content = fs.readFileSync(filePath, 'utf8');
  if (hasAgentTraceBootBlock(content)) return false;
  const idx = findAgentTraceBootInsertIndex(content);
  if (idx < 0) {
    throw new Error('Could not find boot insert point in src/index.ts');
  }
  fs.writeFileSync(filePath, `${content.slice(0, idx)}\n${AGENTTRACE_BOOT_BLOCK}\n${content.slice(idx)}`);
  return true;
}

export function removeAgentTraceBootBlock(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'src/index.ts');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!hasAgentTraceBootBlock(content)) return false;
  fs.writeFileSync(filePath, content.replace(BOOT_BLOCK_PATTERN, ''));
  return true;
}

const OBSERVE_SNIPPET = `
        ${CLAUDE_OBSERVE_MARKER_BEGIN}
        try {
          const { observeClaudeSdkMessage } = await import('../agenttrace/observe.js');
          observeClaudeSdkMessage(message);
        } catch {
          /* agenttrace optional */
        }
        ${CLAUDE_OBSERVE_MARKER_END}
`;

const PARTIAL_SNIPPET = `
        ${CLAUDE_PARTIAL_MARKER_BEGIN}
        includePartialMessages: true,
        ${CLAUDE_PARTIAL_MARKER_END}
`;

const SDKOPTS_SNIPPET = `
        ${CLAUDE_SDKOPTS_MARKER_BEGIN}
        ...(() => {
          try {
            // observe.js (ESM) registers this bridge when the poll-loop hook
            // async-imports it before each provider query — a sync require()
            // of an ES module would throw and silently disable reasoning.
            const bridge = Reflect.get(globalThis, '__nanoclawAgentTraceQueryOptions');
            if (typeof bridge === 'function') return bridge();
            if (
              (process.env.AGENTTRACE_ENABLED || '').trim() &&
              !Reflect.get(globalThis, '__nanoclawAgentTraceOptsWarned')
            ) {
              Reflect.set(globalThis, '__nanoclawAgentTraceOptsWarned', true);
              console.error(
                '[agenttrace] observe.js is not loaded — summarized thinking will not be requested. ' +
                  'Check the poll-loop patch and agenttrace runner files (issue #7).',
              );
            }
            return {};
          } catch {
            return {};
          }
        })(),
        ${CLAUDE_SDKOPTS_MARKER_END}
`;

const POLL_SNIPPET_MESSAGES = `
    ${POLL_HOOK_MARKER_BEGIN}
    if (messages.length > 0) {
      try {
        const { agentTraceOnInboundBatch } = await import('./agenttrace/poll-hook.js');
        agentTraceOnInboundBatch(messages.map((m: { id: string }) => m.id));
      } catch {
        /* agenttrace optional */
      }
    }
    ${POLL_HOOK_MARKER_END}
`;

/** Matches sdkopts blocks that predate the globalThis bridge (0.2.0 dev builds
 * used a sync require() of ESM observe.js, which throws — issue #7 — and the
 * original 0.1.x snippet duplicated the env parse). Both get re-spliced. */
export function hasStaleSdkoptsBlock(content: string): boolean {
  const start = content.indexOf(CLAUDE_SDKOPTS_MARKER_BEGIN);
  if (start < 0) return false;
  const end = content.indexOf(CLAUDE_SDKOPTS_MARKER_END, start);
  if (end < 0) return true;
  const block = content.slice(start, end);
  return !block.includes('__nanoclawAgentTraceQueryOptions');
}

export function patchClaudeProvider(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'container/agent-runner/src/providers/claude.ts');
  if (!fs.existsSync(filePath)) {
    throw new Error('container/agent-runner/src/providers/claude.ts not found');
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (hasStaleSdkoptsBlock(content)) {
    content = stripMarkedBlock(content, CLAUDE_SDKOPTS_MARKER_BEGIN, CLAUDE_SDKOPTS_MARKER_END);
    changed = true;
  }

  if (!content.includes(CLAUDE_OBSERVE_MARKER_BEGIN)) {
    const anchor = 'yield { type: \'activity\' };';
    const idx = content.indexOf(anchor);
    if (idx < 0) throw new Error('Could not find activity yield in claude.ts');
    const insertAt = idx + anchor.length;
    content = content.slice(0, insertAt) + OBSERVE_SNIPPET + content.slice(insertAt);
    changed = true;
  }

  if (!content.includes(CLAUDE_PARTIAL_MARKER_BEGIN)) {
    const anchor = 'permissionMode: \'bypassPermissions\',';
    const idx = content.indexOf(anchor);
    if (idx < 0) {
      // try double-quote form
      const alt = 'permissionMode: "bypassPermissions",';
      const idx2 = content.indexOf(alt);
      if (idx2 < 0) throw new Error('Could not find permissionMode in claude.ts');
      content =
        content.slice(0, idx2) + PARTIAL_SNIPPET + content.slice(idx2);
    } else {
      content = content.slice(0, idx) + PARTIAL_SNIPPET + content.slice(idx);
    }
    changed = true;
  }

  if (!content.includes(CLAUDE_SDKOPTS_MARKER_BEGIN)) {
    // Prefer inserting after the partial-messages marker so upgrades land next to it.
    const afterPartial = content.indexOf(CLAUDE_PARTIAL_MARKER_END);
    if (afterPartial >= 0) {
      const insertAt = afterPartial + CLAUDE_PARTIAL_MARKER_END.length;
      content = content.slice(0, insertAt) + SDKOPTS_SNIPPET + content.slice(insertAt);
      changed = true;
    } else {
      const anchor = 'permissionMode: \'bypassPermissions\',';
      const idx = content.indexOf(anchor);
      if (idx >= 0) {
        content = content.slice(0, idx) + SDKOPTS_SNIPPET + content.slice(idx);
        changed = true;
      } else {
        const alt = 'permissionMode: "bypassPermissions",';
        const idx2 = content.indexOf(alt);
        if (idx2 < 0) throw new Error('Could not find permissionMode in claude.ts for sdkopts');
        content = content.slice(0, idx2) + SDKOPTS_SNIPPET + content.slice(idx2);
        changed = true;
      }
    }
  }

  if (changed) fs.writeFileSync(filePath, content);
  return changed;
}

export function unpatchClaudeProvider(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'container/agent-runner/src/providers/claude.ts');
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content;
  content = stripMarkedBlock(content, CLAUDE_OBSERVE_MARKER_BEGIN, CLAUDE_OBSERVE_MARKER_END);
  content = stripMarkedBlock(content, CLAUDE_PARTIAL_MARKER_BEGIN, CLAUDE_PARTIAL_MARKER_END);
  content = stripMarkedBlock(content, CLAUDE_SDKOPTS_MARKER_BEGIN, CLAUDE_SDKOPTS_MARKER_END);
  if (content !== before) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

export function patchPollLoop(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'container/agent-runner/src/poll-loop.ts');
  if (!fs.existsSync(filePath)) {
    throw new Error('container/agent-runner/src/poll-loop.ts not found');
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(POLL_HOOK_MARKER_BEGIN)) return false;

  // Insert after the outer-loop pending fetch (messages = getPendingMessages...)
  const patterns = [
    /const messages = getPendingMessages\([^)]*\)[^;]*;/,
    /const pending = getPendingMessages\([^)]*\);/,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m?.index != null) {
      const insertAt = m.index + m[0].length;
      const snippet = m[0].includes('messages')
        ? POLL_SNIPPET_MESSAGES
        : POLL_SNIPPET_MESSAGES.replace(/messages/g, 'pending');
      content = content.slice(0, insertAt) + snippet + content.slice(insertAt);
      fs.writeFileSync(filePath, content);
      return true;
    }
  }

  throw new Error(
    'Could not patch poll-loop.ts for turn_start hooks — no getPendingMessages anchor found. ' +
      'Without this patch, seq/turnId never reset between turns.',
  );
}

export function unpatchPollLoop(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'container/agent-runner/src/poll-loop.ts');
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const next = stripMarkedBlock(content, POLL_HOOK_MARKER_BEGIN, POLL_HOOK_MARKER_END);
  if (next !== content) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

const CONTAINER_ENV_IMPORT = `import { agentTraceEnvArgs } from './agenttrace-env.js';\n`;
const CONTAINER_ENV_SNIPPET = `
  ${CONTAINER_ENV_MARKER_BEGIN}
  args.push(...agentTraceEnvArgs());
  ${CONTAINER_ENV_MARKER_END}
`;

/**
 * Forward AGENTTRACE_* into containers after the TZ env line in buildContainerArgs.
 * Without this, observe stays fail-closed and only host keepalives (typing) appear.
 */
export function patchContainerRunner(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'src/container-runner.ts');
  if (!fs.existsSync(filePath)) {
    throw new Error('src/container-runner.ts not found');
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(CONTAINER_ENV_MARKER_BEGIN)) return false;

  if (!content.includes("from './agenttrace-env.js'") && !content.includes('from "./agenttrace-env.js"')) {
    // Insert import after the last relative import near the top.
    const importRe = /^import .+ from '\.\/[^']+';\r?\n/gm;
    let lastImportEnd = 0;
    for (const m of content.matchAll(importRe)) {
      if (m.index != null) lastImportEnd = m.index + m[0].length;
    }
    if (lastImportEnd <= 0) {
      throw new Error('Could not find import insert point in src/container-runner.ts');
    }
    content = content.slice(0, lastImportEnd) + CONTAINER_ENV_IMPORT + content.slice(lastImportEnd);
  }

  const tzRe = /args\.push\('-e',\s*`TZ=\$\{TIMEZONE\}`\);/;
  const m = content.match(tzRe);
  if (!m || m.index == null) {
    throw new Error(
      'Could not patch container-runner.ts for AGENTTRACE env — no TZ env anchor found.',
    );
  }
  const insertAt = m.index + m[0].length;
  content = content.slice(0, insertAt) + CONTAINER_ENV_SNIPPET + content.slice(insertAt);
  fs.writeFileSync(filePath, content);
  return true;
}

export function unpatchContainerRunner(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, 'src/container-runner.ts');
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  const next = stripMarkedBlock(content, CONTAINER_ENV_MARKER_BEGIN, CONTAINER_ENV_MARKER_END);
  let changed = next !== content;
  content = next.replace(/^import \{ agentTraceEnvArgs \} from '\.\/agenttrace-env\.js';\r?\n/m, '');
  if (content !== next) changed = true;
  if (changed) fs.writeFileSync(filePath, content);
  return changed;
}

function stripMarkedBlock(content: string, begin: string, end: string): string {
  const start = content.indexOf(begin);
  if (start < 0) return content;
  const endIdx = content.indexOf(end, start);
  if (endIdx < 0) return content;
  let from = start;
  // include leading newline
  if (from > 0 && content[from - 1] === '\n') from -= 1;
  const to = endIdx + end.length;
  return content.slice(0, from) + content.slice(to);
}

export function scaffoldEnv(nanoclawRoot: string): { created: string[]; skipped: string[] } {
  const envPath = path.join(nanoclawRoot, '.env');
  const created: string[] = [];
  const skipped: string[] = [];
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
  const existing = new Set(lines.map((l) => l.split('=')[0]?.trim()).filter(Boolean));

  const additions: Record<string, string> = {
    AGENTTRACE_ENABLED: 'false',
    AGENTTRACE_DEFAULT_VISIBILITY: 'trace',
    AGENTTRACE_SILENCE_KEEPALIVE: 'true',
  };

  for (const [key, value] of Object.entries(additions)) {
    if (existing.has(key)) {
      skipped.push(key);
      continue;
    }
    lines.push(`${key}=${value}`);
    created.push(key);
  }

  if (created.length > 0) {
    fs.writeFileSync(envPath, `${lines.join('\n').replace(/\n?$/, '')}\n`);
  }
  return { created, skipped };
}

/** Pin used by host + container redaction (same library/version as SkeinAI). */
export const SECRET_SCAN_PACKAGE = '@sanity-labs/secret-scan';
export const SECRET_SCAN_VERSION = '1.1.0';

/**
 * Ensure host + agent-runner package.json declare the secret-scan dependency.
 * Caller still needs `pnpm install` / `bun install` to fetch it.
 */
export function ensureSecretScanDependency(nanoclawRoot: string): {
  hostAdded: boolean;
  runnerAdded: boolean;
} {
  const hostAdded = ensureDepInPackageJson(
    path.join(nanoclawRoot, 'package.json'),
    SECRET_SCAN_PACKAGE,
    SECRET_SCAN_VERSION,
  );
  const runnerAdded = ensureDepInPackageJson(
    path.join(nanoclawRoot, 'container/agent-runner/package.json'),
    SECRET_SCAN_PACKAGE,
    SECRET_SCAN_VERSION,
  );
  return { hostAdded, runnerAdded };
}

function ensureDepInPackageJson(pkgPath: string, name: string, version: string): boolean {
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies ??= {};
  if (pkg.dependencies[name] === version) return false;
  pkg.dependencies[name] = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

export function removeEnvVars(nanoclawRoot: string): string[] {
  const envPath = path.join(nanoclawRoot, '.env');
  if (!fs.existsSync(envPath)) return [];
  const removed: string[] = [];
  const allowlist = new Set<string>(SCAFFOLDED_ENV_KEYS);
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const kept = lines.filter((line) => {
    const key = line.split('=')[0]?.trim();
    if (key && allowlist.has(key)) {
      removed.push(key);
      return false;
    }
    return true;
  });
  fs.writeFileSync(envPath, `${kept.join('\n').replace(/\n?$/, '')}\n`);
  return removed;
}

export function syncSkillToFork(nanoclawRoot: string, skillSource = skillDir()): string {
  const dest = path.join(nanoclawRoot, '.claude/skills/add-agenttrace');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copyDir(skillSource, dest);
  return dest;
}

export function removeHostFiles(nanoclawRoot: string): string[] {
  const removed: string[] = [];
  for (const rule of [...HOST_COPY_RULES, ...HOST_OPTIONAL_COPY_RULES]) {
    const target = path.join(nanoclawRoot, rule.dest);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed.push(rule.dest);
    }
  }
  return removed;
}

export function removeRunnerFiles(nanoclawRoot: string): string[] {
  const removed: string[] = [];
  for (const rule of [...RUNNER_COPY_RULES, ...RUNNER_OPTIONAL_COPY_RULES]) {
    const target = path.join(nanoclawRoot, rule.dest);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed.push(rule.dest);
    }
  }
  const dir = path.join(nanoclawRoot, 'container/agent-runner/src/agenttrace');
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
  return removed;
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}
