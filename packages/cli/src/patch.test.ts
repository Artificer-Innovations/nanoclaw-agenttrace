import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasStaleSdkoptsBlock, patchClaudeProvider } from './patch.js';
import { CLAUDE_SDKOPTS_MARKER_BEGIN, CLAUDE_SDKOPTS_MARKER_END } from './paths.js';

const BRIDGE_KEY = '__nanoclawAgentTraceQueryOptions';
const WARNED_KEY = '__nanoclawAgentTraceOptsWarned';

/** The broken 0.2.0-dev splice from #5 — sync require() of ESM observe.js (issue #7). */
const STALE_REQUIRE_BLOCK = `${CLAUDE_SDKOPTS_MARKER_BEGIN}
        ...(() => {
          try {
            return require('../agenttrace/observe.js').agentTraceQueryOptions();
          } catch {
            return {};
          }
        })(),
        ${CLAUDE_SDKOPTS_MARKER_END}`;

const FIXTURE_CLAUDE = `import { sdkQuery } from 'sdk';

export function providerQuery(stream: unknown) {
  const sdkResult = sdkQuery({
    prompt: stream,
    options: {
      model: 'test-model',
      permissionMode: 'bypassPermissions',
    },
  });
  for (const message of sdkResult) {
    yield { type: 'activity' };
  }
}
`;

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenttrace-patch-'));
  const providerDir = path.join(root, 'container/agent-runner/src/providers');
  fs.mkdirSync(providerDir, { recursive: true });
  fs.writeFileSync(path.join(providerDir, 'claude.ts'), FIXTURE_CLAUDE);
  return root;
}

function readPatchedClaude(root: string): string {
  return fs.readFileSync(
    path.join(root, 'container/agent-runner/src/providers/claude.ts'),
    'utf8',
  );
}

function extractSdkoptsBlock(content: string): string {
  const start = content.indexOf(CLAUDE_SDKOPTS_MARKER_BEGIN);
  const end = content.indexOf(CLAUDE_SDKOPTS_MARKER_END);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end + CLAUDE_SDKOPTS_MARKER_END.length);
}

/**
 * Execute the spliced sdkopts block as a real ES module — this is the
 * regression test for issue #7, where a sync require() of ESM observe.js
 * threw at runtime and the catch silently disabled summarized thinking.
 */
async function executeSdkoptsBlock(block: string): Promise<Record<string, unknown>> {
  const file = path.join(
    os.tmpdir(),
    `agenttrace-sdkopts-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(file, `export const options = {\n${block}\n};\n`);
  try {
    const mod = (await import(pathToFileURL(file).href)) as {
      options: Record<string, unknown>;
    };
    return mod.options;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

describe('patchClaudeProvider sdkopts splice', () => {
  const roots: string[] = [];
  let savedEnabled: string | undefined;

  beforeEach(() => {
    savedEnabled = process.env.AGENTTRACE_ENABLED;
    delete process.env.AGENTTRACE_ENABLED;
    Reflect.deleteProperty(globalThis, BRIDGE_KEY);
    Reflect.deleteProperty(globalThis, WARNED_KEY);
  });

  afterEach(() => {
    if (savedEnabled === undefined) delete process.env.AGENTTRACE_ENABLED;
    else process.env.AGENTTRACE_ENABLED = savedEnabled;
    Reflect.deleteProperty(globalThis, BRIDGE_KEY);
    Reflect.deleteProperty(globalThis, WARNED_KEY);
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('spliced block executes under strict ESM without observe loaded', async () => {
    const root = makeFixtureRoot();
    roots.push(root);
    expect(patchClaudeProvider(root)).toBe(true);

    const block = extractSdkoptsBlock(readPatchedClaude(root));
    expect(block).not.toContain("require('");

    // A require() of ESM here would throw ReferenceError and fail this await.
    const options = await executeSdkoptsBlock(block);
    expect(options).toEqual({});
  });

  it('spliced block reads options from the observe bridge when registered', async () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);
    const block = extractSdkoptsBlock(readPatchedClaude(root));

    Reflect.set(globalThis, BRIDGE_KEY, () => ({
      thinking: { type: 'adaptive', display: 'summarized' },
      forwardSubagentText: true,
    }));

    const options = await executeSdkoptsBlock(block);
    expect(options).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
      forwardSubagentText: true,
    });
  });

  it('warns loudly (once) when enabled but observe never loaded', async () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);
    const block = extractSdkoptsBlock(readPatchedClaude(root));

    process.env.AGENTTRACE_ENABLED = 'true';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await executeSdkoptsBlock(block);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0]?.[0]).toContain('observe.js is not loaded');

    // Second evaluation: warned flag persists, no repeat spam.
    await executeSdkoptsBlock(block);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('stays silent when disabled and observe never loaded', async () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);
    const block = extractSdkoptsBlock(readPatchedClaude(root));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await executeSdkoptsBlock(block);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('stays silent when AGENTTRACE_ENABLED=false (scaffold default)', async () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);
    const block = extractSdkoptsBlock(readPatchedClaude(root));

    // .env scaffold writes AGENTTRACE_ENABLED=false — a non-empty value that
    // must parse as disabled, matching observe.ts readVisibility.
    process.env.AGENTTRACE_ENABLED = 'false';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = await executeSdkoptsBlock(block);
    expect(options).toEqual({});
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('old require-based splice throws under ESM, and its catch turned that into a silent {}', async () => {
    // Affirmative repro of issue #7: require() of the observe module from an
    // ES module throws. (Plain Node ESM: ReferenceError — require undefined.
    // Vitest's loader shims require into the module, so here it surfaces as
    // MODULE_NOT_FOUND instead. Either way the call throws at runtime.)
    const bare = `...(() => require('../agenttrace/observe.js').agentTraceQueryOptions())(),`;
    await expect(executeSdkoptsBlock(bare)).rejects.toThrow();

    // …and the shipped block's try/catch swallowed it: even with the bridge
    // registered and agenttrace enabled, the old splice yields {} — the exact
    // silent no-op this PR fixes. The new block (tested above) returns options.
    process.env.AGENTTRACE_ENABLED = 'true';
    Reflect.set(globalThis, BRIDGE_KEY, () => ({
      thinking: { type: 'adaptive', display: 'summarized' },
    }));
    const options = await executeSdkoptsBlock(STALE_REQUIRE_BLOCK);
    expect(options).toEqual({});
  });

  it('throws on a corrupt sdkopts block (begin marker without end marker)', () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);

    const filePath = path.join(root, 'container/agent-runner/src/providers/claude.ts');
    const patched = fs.readFileSync(filePath, 'utf8');
    const corrupt = patched.replace(
      extractSdkoptsBlock(patched),
      `${CLAUDE_SDKOPTS_MARKER_BEGIN}\n        ...(() => ({}))(),`,
    );
    fs.writeFileSync(filePath, corrupt);

    // Silent path would be: strip no-ops, reinsert skipped (begin marker still
    // present), "changed" reported anyway. Must fail loudly instead.
    expect(() => patchClaudeProvider(root)).toThrow(/corrupt agenttrace sdkopts block/);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(corrupt);
  });

  it('upgrade replaces a stale require-based sdkopts block', () => {
    const root = makeFixtureRoot();
    roots.push(root);
    patchClaudeProvider(root);

    // Simulate the broken 0.2.0-dev splice (issue #7).
    const filePath = path.join(root, 'container/agent-runner/src/providers/claude.ts');
    const patched = fs.readFileSync(filePath, 'utf8');
    const stale = patched.replace(extractSdkoptsBlock(patched), STALE_REQUIRE_BLOCK);
    fs.writeFileSync(filePath, stale);
    expect(hasStaleSdkoptsBlock(stale)).toBe(true);

    expect(patchClaudeProvider(root)).toBe(true);
    const healed = readPatchedClaude(root);
    expect(hasStaleSdkoptsBlock(healed)).toBe(false);
    expect(healed).not.toContain("require('../agenttrace/observe.js')");
    expect(healed).toContain(BRIDGE_KEY);
  });

  it('is idempotent once the bridge-based block is in place', () => {
    const root = makeFixtureRoot();
    roots.push(root);
    expect(patchClaudeProvider(root)).toBe(true);
    expect(patchClaudeProvider(root)).toBe(false);
  });
});

describe('hasStaleSdkoptsBlock', () => {
  it('returns false when no sdkopts block exists', () => {
    expect(hasStaleSdkoptsBlock('const x = 1;')).toBe(false);
  });

  it('flags a block missing the bridge lookup', () => {
    const content = `${CLAUDE_SDKOPTS_MARKER_BEGIN}\n...(() => ({}))(),\n${CLAUDE_SDKOPTS_MARKER_END}`;
    expect(hasStaleSdkoptsBlock(content)).toBe(true);
  });

  it('accepts the current bridge-based block', () => {
    const content = `${CLAUDE_SDKOPTS_MARKER_BEGIN}\nReflect.get(globalThis, '__nanoclawAgentTraceQueryOptions')\n${CLAUDE_SDKOPTS_MARKER_END}`;
    expect(hasStaleSdkoptsBlock(content)).toBe(false);
  });
});
