import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findHosthooksIssues, requireHosthooks } from "./hosthooks.js";
import {
  insertAgentTraceRunnerBootBlock,
  removeAgentTraceRunnerBootBlock,
} from "./patch.js";
import { AGENTTRACE_RUNNER_BOOT_BLOCK } from "./paths.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-hosthooks-"));
  roots.push(root);
  return root;
}

function write(root: string, relative: string, content: string): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function installHosthooksFixture(root: string): void {
  write(
    root,
    "src/hosthooks.ts",
    [
      "export const HOSTHOOKS_API_VERSION = 1;",
      "registerContainerEnvContributor;",
      "containerEnv: true",
      "probeHosthooksCapabilities",
    ].join("\n")
  );
  write(
    root,
    "container/agent-runner/src/hosthooks.ts",
    [
      "export const HOSTHOOKS_API_VERSION = 1;",
      "registerProviderMessageObserver;",
      "registerProviderQueryOptionsContributor;",
      "registerInboundBatchObserver;",
      "registerProviderQueryStartObserver;",
      "providerMessageObserver: true;",
      "providerQueryOptions: true;",
      "inboundBatchObserver: true;",
      "providerQueryStart: true;",
      "probeHosthooksCapabilities",
    ].join("\n")
  );
  write(
    root,
    "src/container-runner.ts",
    "// @nanoclaw-hosthooks:container-env:begin"
  );
  write(
    root,
    "container/agent-runner/src/providers/claude.ts",
    [
      "// @nanoclaw-hosthooks:claude-query-options:begin",
      "// @nanoclaw-hosthooks:claude-observer:begin",
      "// @nanoclaw-hosthooks:claude-query-start:begin",
    ].join("\n")
  );
  write(
    root,
    "container/agent-runner/src/providers/codex.ts",
    "// @nanoclaw-hosthooks:codex-query-start:begin"
  );
  write(
    root,
    "container/agent-runner/src/providers/opencode.ts",
    "// @nanoclaw-hosthooks:opencode-query-start:begin"
  );
  write(
    root,
    "container/agent-runner/src/poll-loop.ts",
    [
      "// @nanoclaw-hosthooks:poll-observer:begin",
      "// @nanoclaw-hosthooks:poll-query-start:begin",
      "// @nanoclaw-hosthooks:poll-session-init:begin",
    ].join("\n")
  );
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("hosthooks prerequisite", () => {
  it("accepts API v1 host and runner capabilities with installed call sites", () => {
    const root = makeRoot();
    installHosthooksFixture(root);
    expect(findHosthooksIssues(root)).toEqual([]);
    expect(() => requireHosthooks(root)).not.toThrow();
  });

  it("fails with actionable install and rebuild guidance", () => {
    const root = makeRoot();
    expect(() => requireHosthooks(root)).toThrow(
      /Install nanoclaw-hosthooks@\^0\.2\.0 \(API v1 with providerQueryStart\) first/
    );
  });
});

describe("agenttrace runner registration boot", () => {
  it("inserts idempotently and removes only its own import", () => {
    const root = makeRoot();
    write(
      root,
      "container/agent-runner/src/index.ts",
      "import { runPollLoop } from './poll-loop.js';\n\nvoid runPollLoop;\n"
    );

    expect(insertAgentTraceRunnerBootBlock(root)).toBe(true);
    expect(insertAgentTraceRunnerBootBlock(root)).toBe(false);
    const indexPath = path.join(root, "container/agent-runner/src/index.ts");
    expect(fs.readFileSync(indexPath, "utf8")).toContain(
      AGENTTRACE_RUNNER_BOOT_BLOCK
    );

    expect(removeAgentTraceRunnerBootBlock(root)).toBe(true);
    expect(fs.readFileSync(indexPath, "utf8")).not.toContain(
      AGENTTRACE_RUNNER_BOOT_BLOCK
    );
  });
});
