import fs from "node:fs";
import path from "node:path";
import {
  AGENTTRACE_BOOT_BLOCK,
  AGENTTRACE_MARKER,
  AGENTTRACE_RUNNER_BOOT_BLOCK,
  HOST_COPY_RULES,
  HOST_OPTIONAL_COPY_RULES,
  RUNNER_COPY_RULES,
  RUNNER_OPTIONAL_COPY_RULES,
  resourcesDir,
  runnerResourcesDir,
  skillDir,
} from "./paths.js";

export const SCAFFOLDED_ENV_KEYS = [
  "AGENTTRACE_ENABLED",
  "AGENTTRACE_DEFAULT_VISIBILITY",
  "AGENTTRACE_SILENCE_KEEPALIVE",
] as const;

const BOOT_BEGIN = `// ${AGENTTRACE_MARKER}:index-boot:begin`;
const BOOT_END = `// ${AGENTTRACE_MARKER}:index-boot:end`;

/** Pre-marker two-line boot (0.1–0.3 installs). */
const UNMARKED_BOOT_PATTERN =
  /^[ \t]*const \{ startAgentTrace \} = await import\('\.\/agenttrace-boot\.js'\);\r?\n^[ \t]*await startAgentTrace\(\);\r?\n(?:\r?\n)?/gm;

/**
 * Orphan rationale left when unmarked uninstall removed only the two boot
 * lines, or when stripBootMarkers() drops unbalanced markers but leaves the
 * comment block. Matches both the legacy header ("Agenttrace must register…")
 * and the current marked-block header ("Register container-env…"). Anchored
 * end-to-end so we do not eat stock NanoClaw comments such as
 * `// 5. Start delivery polls`.
 */
const ORPHAN_RATIONALE_PATTERN =
  /^[ \t]*\/\/ (?:Agenttrace must register its container-env contributor BEFORE the first|Register container-env contributor BEFORE the first wake\/spawn\.)\r?\n(?:^[ \t]*\/\/[^\n]*\r?\n)*?[ \t]*\/\/[^\n]*tool\/thinking traces[^\n]*\r?\n/gm;

const MARKED_BOOT_PATTERN = new RegExp(
  `\\r?\\n?[ \\t]*${escapeRegExp(
    BOOT_BEGIN
  )}\\r?\\n[\\s\\S]*?[ \\t]*${escapeRegExp(BOOT_END)}\\r?\\n?`,
  "g"
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let from = 0;
  while ((from = content.indexOf(needle, from)) !== -1) {
    count += 1;
    from += needle.length;
  }
  return count;
}

/** Require equal begin/end counts so non-greedy replace cannot span past a stray begin. */
function assertBootMarkersBalanced(content: string, action: string): void {
  const begins = countOccurrences(content, BOOT_BEGIN);
  const ends = countOccurrences(content, BOOT_END);
  if (begins !== ends) {
    throw new Error(
      `Cannot ${action} agenttrace boot: unbalanced markers (${begins} begin, ${ends} end)`
    );
  }
}

/** Drop complete pairs plus leftover markers / boot calls (repair path for install). */
function stripBootMarkers(content: string): string {
  MARKED_BOOT_PATTERN.lastIndex = 0;
  let next = content.replace(MARKED_BOOT_PATTERN, "\n");
  next = next.replace(
    new RegExp(`^[ \\t]*${escapeRegExp(BOOT_BEGIN)}\\r?\\n`, "gm"),
    ""
  );
  next = next.replace(
    new RegExp(`^[ \\t]*${escapeRegExp(BOOT_END)}\\r?\\n`, "gm"),
    ""
  );
  // Incomplete marked bodies may leave the import/await lines behind.
  next = next.replace(UNMARKED_BOOT_PATTERN, "");
  next = next.replace(
    /^[ \t]*const \{ startAgentTrace \} = await import\('\.\/agenttrace-boot\.js'\);\r?\n/gm,
    ""
  );
  next = next.replace(/^[ \t]*await startAgentTrace\(\);\r?\n/gm, "");
  return next.replace(/\n{3,}/g, "\n\n");
}

/** True only when a paired begin…end boot block is present (not a bare begin / stray call). */
export function hasAgentTraceBootBlock(content: string): boolean {
  MARKED_BOOT_PATTERN.lastIndex = 0;
  return MARKED_BOOT_PATTERN.test(content);
}

/**
 * Preferred insert: before delivery polls / peer boots so container-env is
 * registered before any wake. Fallbacks keep older NanoClaw layouts working.
 */
export function findAgentTraceBootInsertIndex(content: string): number {
  const beforeSessionio = content.match(
    /^[ \t]*\/\/ @nanoclaw-sessionio:index-boot:begin\r?\n/m
  );
  if (beforeSessionio?.index != null) return beforeSessionio.index;

  const beforeFly = content.match(
    /^[ \t]*\/\/ @nanoclaw-agenthost-flyio:boot:begin\r?\n/m
  );
  if (beforeFly?.index != null) return beforeFly.index;

  const beforeProcess = content.match(
    /^[ \t]*\/\/ @nanoclaw-agenthost-process:boot:begin\r?\n/m
  );
  if (beforeProcess?.index != null) return beforeProcess.index;

  const beforeDelivery = content.match(
    /^[ \t]*startActiveDeliveryPoll\(\);\r?\n/m
  );
  if (beforeDelivery?.index != null) return beforeDelivery.index;

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

/** Strip pre-marker boots + orphan comments left by incomplete uninstalls. */
export function scavengeLegacyAgentTraceBoot(content: string): string {
  let next = content.replace(UNMARKED_BOOT_PATTERN, "");
  next = next.replace(ORPHAN_RATIONALE_PATTERN, "");
  return next.replace(/\n{3,}/g, "\n\n");
}

export function insertAgentTraceBootBlockContent(content: string): string {
  let next = content;
  const begins = countOccurrences(next, BOOT_BEGIN);
  const ends = countOccurrences(next, BOOT_END);
  if (begins !== ends) {
    // Begin-without-end (or reverse) must not count as "already installed".
    next = stripBootMarkers(next);
  } else if (hasAgentTraceBootBlock(next)) {
    return next;
  }
  next = scavengeLegacyAgentTraceBoot(next);
  if (hasAgentTraceBootBlock(next)) return next;
  const idx = findAgentTraceBootInsertIndex(next);
  if (idx < 0) {
    throw new Error("Could not find boot insert point in src/index.ts");
  }
  return `${next.slice(0, idx)}${AGENTTRACE_BOOT_BLOCK}\n${next.slice(idx)}`;
}

export function removeAgentTraceBootBlockContent(content: string): string {
  assertBootMarkersBalanced(content, "uninstall");
  MARKED_BOOT_PATTERN.lastIndex = 0;
  let next = content.replace(MARKED_BOOT_PATTERN, "\n");
  next = scavengeLegacyAgentTraceBoot(next);
  return next.replace(/\n{3,}/g, "\n\n");
}

export function copyHostFiles(
  nanoclawRoot: string,
  resources?: string
): string[] {
  const resolved = resources ?? resourcesDir(undefined, nanoclawRoot);
  const missing = HOST_COPY_RULES.filter(
    (r) => !fs.existsSync(path.join(resolved, r.source))
  ).map((r) => r.source);
  if (missing.length > 0) {
    throw new Error(
      `Missing host resources: ${missing.join(
        ", "
      )}. Run pnpm run build in nanoclaw-agenttrace.`
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

export function copyRunnerFiles(
  nanoclawRoot: string,
  resources?: string
): string[] {
  const resolved = resources ?? runnerResourcesDir(undefined, nanoclawRoot);
  const missing = RUNNER_COPY_RULES.filter(
    (r) => !fs.existsSync(path.join(resolved, r.source))
  ).map((r) => r.source);
  if (missing.length > 0) {
    throw new Error(
      `Missing runner resources: ${missing.join(
        ", "
      )}. Run pnpm run build in nanoclaw-agenttrace.`
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
  const filePath = path.join(nanoclawRoot, "src/index.ts");
  const content = fs.readFileSync(filePath, "utf8");
  const next = insertAgentTraceBootBlockContent(content);
  if (next === content) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

export function removeAgentTraceBootBlock(nanoclawRoot: string): boolean {
  const filePath = path.join(nanoclawRoot, "src/index.ts");
  const content = fs.readFileSync(filePath, "utf8");
  const next = removeAgentTraceBootBlockContent(content);
  if (next === content) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

export function insertAgentTraceRunnerBootBlock(nanoclawRoot: string): boolean {
  const filePath = path.join(
    nanoclawRoot,
    "container/agent-runner/src/index.ts"
  );
  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes(AGENTTRACE_RUNNER_BOOT_BLOCK)) return false;
  const firstImport = content.search(/^import /m);
  if (firstImport < 0) {
    throw new Error(
      "Could not find runner boot insert point in container/agent-runner/src/index.ts"
    );
  }
  fs.writeFileSync(
    filePath,
    `${content.slice(
      0,
      firstImport
    )}${AGENTTRACE_RUNNER_BOOT_BLOCK}\n${content.slice(firstImport)}`
  );
  return true;
}

export function removeAgentTraceRunnerBootBlock(nanoclawRoot: string): boolean {
  const filePath = path.join(
    nanoclawRoot,
    "container/agent-runner/src/index.ts"
  );
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const next = content.replace(`${AGENTTRACE_RUNNER_BOOT_BLOCK}\n`, "");
  if (next === content) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

export function scaffoldEnv(nanoclawRoot: string): {
  created: string[];
  skipped: string[];
} {
  const envPath = path.join(nanoclawRoot, ".env");
  const created: string[] = [];
  const skipped: string[] = [];
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split("\n")
    : [];
  const existing = new Set(
    lines.map((l) => l.split("=")[0]?.trim()).filter(Boolean)
  );

  const additions: Record<string, string> = {
    AGENTTRACE_ENABLED: "false",
    AGENTTRACE_DEFAULT_VISIBILITY: "trace",
    AGENTTRACE_SILENCE_KEEPALIVE: "true",
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
    fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n?$/, "")}\n`);
  }
  return { created, skipped };
}

/** Pin used by host + container redaction (same library/version as SkeinAI). */
export const SECRET_SCAN_PACKAGE = "@sanity-labs/secret-scan";
export const SECRET_SCAN_VERSION = "1.1.0";

/**
 * Ensure host + agent-runner package.json declare the secret-scan dependency.
 * Caller still needs `pnpm install` / `bun install` to fetch it.
 */
export function ensureSecretScanDependency(nanoclawRoot: string): {
  hostAdded: boolean;
  runnerAdded: boolean;
} {
  const hostAdded = ensureDepInPackageJson(
    path.join(nanoclawRoot, "package.json"),
    SECRET_SCAN_PACKAGE,
    SECRET_SCAN_VERSION
  );
  const runnerAdded = ensureDepInPackageJson(
    path.join(nanoclawRoot, "container/agent-runner/package.json"),
    SECRET_SCAN_PACKAGE,
    SECRET_SCAN_VERSION
  );
  return { hostAdded, runnerAdded };
}

function ensureDepInPackageJson(
  pkgPath: string,
  name: string,
  version: string
): boolean {
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies ??= {};
  if (pkg.dependencies[name] === version) return false;
  pkg.dependencies[name] = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

export function removeEnvVars(nanoclawRoot: string): string[] {
  const envPath = path.join(nanoclawRoot, ".env");
  if (!fs.existsSync(envPath)) return [];
  const removed: string[] = [];
  const allowlist = new Set<string>(SCAFFOLDED_ENV_KEYS);
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const kept = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    if (key && allowlist.has(key)) {
      removed.push(key);
      return false;
    }
    return true;
  });
  fs.writeFileSync(envPath, `${kept.join("\n").replace(/\n?$/, "")}\n`);
  return removed;
}

export function syncSkillToFork(
  nanoclawRoot: string,
  skillSource = skillDir()
): string {
  const dest = path.join(nanoclawRoot, ".claude/skills/add-agenttrace");
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
  const dir = path.join(nanoclawRoot, "container/agent-runner/src/agenttrace");
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
