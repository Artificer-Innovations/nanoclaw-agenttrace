import { describe, expect, it } from "vitest";
import {
  findAgentTraceBootInsertIndex,
  hasAgentTraceBootBlock,
  insertAgentTraceBootBlockContent,
  removeAgentTraceBootBlockContent,
  scavengeLegacyAgentTraceBoot,
} from "./patch.js";
import { AGENTTRACE_BOOT_BLOCK } from "./paths.js";

const STOCK_MAIN = `async function main() {
  setDeliveryAdapter(createChannelDeliveryAdapter());

  // 5. Start delivery polls
  startActiveDeliveryPoll();
  startSweepDeliveryPoll();
  log.info('Delivery polls started');

  startHostSweep();
  await startCliServer();
  log.info('NanoClaw running');
}
`;

const LEGACY_ORPHAN = `  // Agenttrace must register its container-env contributor BEFORE the first
  // wake/spawn. Host-sweep and delivery polls can wake containers for due
  // messages immediately; if startAgentTrace runs after that, the first
  // container boots without AGENTTRACE_ENABLED and observe stays fail-closed
  // (host silence keepalives still fire, but no tool/thinking traces).
`;

const LEGACY_UNMARKED_BOOT = `  const { startAgentTrace } = await import('./agenttrace-boot.js');
  await startAgentTrace();
`;

const BOOT_BEGIN_LINE = "// @nanoclaw-agenttrace:index-boot:begin";

describe("agenttrace index boot patch", () => {
  it("inserts a marked boot before delivery polls", () => {
    const once = insertAgentTraceBootBlockContent(STOCK_MAIN);
    expect(once).toContain("@nanoclaw-agenttrace:index-boot:begin");
    expect(once).toContain("@nanoclaw-agenttrace:index-boot:end");
    expect(once).toContain("startAgentTrace");
    expect(once.indexOf("startAgentTrace")).toBeLessThan(
      once.indexOf("startActiveDeliveryPoll")
    );
    expect(insertAgentTraceBootBlockContent(once)).toBe(once);
  });

  it("prefers insert before sessionio boot markers", () => {
    const withSessionio = STOCK_MAIN.replace(
      "  // 5. Start delivery polls\n",
      `// @nanoclaw-sessionio:index-boot:begin
  { await startSessionio(); }
// @nanoclaw-sessionio:index-boot:end

  // 5. Start delivery polls
`
    );
    const idx = findAgentTraceBootInsertIndex(withSessionio);
    expect(withSessionio.slice(idx, idx + 40)).toContain(
      "@nanoclaw-sessionio:index-boot:begin"
    );
    const installed = insertAgentTraceBootBlockContent(withSessionio);
    expect(
      installed.indexOf("@nanoclaw-agenttrace:index-boot:begin")
    ).toBeLessThan(installed.indexOf("@nanoclaw-sessionio:index-boot:begin"));
  });

  it("scavenges unmarked late boot + orphan rationale on upgrade", () => {
    const dirty = STOCK_MAIN.replace(
      "  // 5. Start delivery polls\n",
      `${LEGACY_ORPHAN}  // 5. Start delivery polls\n`
    ).replace(
      "  await startCliServer();\n",
      `  await startCliServer();\n\n${LEGACY_UNMARKED_BOOT}\n`
    );
    expect(dirty).toContain("Agenttrace must register");
    expect(dirty).toContain("import('./agenttrace-boot.js')");

    const upgraded = insertAgentTraceBootBlockContent(dirty);
    expect(upgraded).toContain("@nanoclaw-agenttrace:index-boot:begin");
    expect(upgraded).not.toContain("Agenttrace must register");
    // Exactly one boot call site
    expect(upgraded.match(/startAgentTrace\(\)/g)?.length).toBe(1);
    expect(upgraded.indexOf("startAgentTrace")).toBeLessThan(
      upgraded.indexOf("startActiveDeliveryPoll")
    );
    // Stock section comment preserved
    expect(upgraded).toContain("// 5. Start delivery polls");
  });

  it("uninstall removes marked block including rationale comments", () => {
    const installed = insertAgentTraceBootBlockContent(STOCK_MAIN);
    const removed = removeAgentTraceBootBlockContent(installed);
    expect(removed).not.toContain("@nanoclaw-agenttrace");
    expect(removed).not.toContain("startAgentTrace");
    expect(removed).not.toContain("container-env contributor");
    expect(removed).toContain("startActiveDeliveryPoll");
    expect(removeAgentTraceBootBlockContent(removed)).toBe(removed);
  });

  it("uninstall removes every marked boot block when duplicates exist", () => {
    const duplicated = `${AGENTTRACE_BOOT_BLOCK}\n${AGENTTRACE_BOOT_BLOCK}\n  startActiveDeliveryPoll();\n`;
    const removed = removeAgentTraceBootBlockContent(duplicated);
    expect(removed).not.toContain("@nanoclaw-agenttrace");
    expect(removed).not.toContain("startAgentTrace");
    expect(removed).toContain("startActiveDeliveryPoll");
  });

  it("uninstall scavenges legacy unmarked residue", () => {
    const dirty = `${LEGACY_ORPHAN}${LEGACY_UNMARKED_BOOT}\n  startActiveDeliveryPoll();\n`;
    const cleaned = removeAgentTraceBootBlockContent(dirty);
    expect(cleaned).not.toContain("startAgentTrace");
    expect(cleaned).not.toContain("Agenttrace must register");
    expect(cleaned).toContain("startActiveDeliveryPoll");
  });

  it("scavengeLegacy is a no-op on clean stock", () => {
    expect(scavengeLegacyAgentTraceBoot(STOCK_MAIN)).toBe(STOCK_MAIN);
  });

  it("hasAgentTraceBootBlock requires a paired begin/end block", () => {
    expect(hasAgentTraceBootBlock(LEGACY_UNMARKED_BOOT)).toBe(false);
    expect(hasAgentTraceBootBlock(AGENTTRACE_BOOT_BLOCK)).toBe(true);
    // Bare begin + startAgentTrace elsewhere must not look installed.
    const incomplete = `// @nanoclaw-agenttrace:index-boot:begin\n  await startAgentTrace();\n`;
    expect(hasAgentTraceBootBlock(incomplete)).toBe(false);
  });

  it("install repairs begin-without-end instead of no-op", () => {
    const incomplete = STOCK_MAIN.replace(
      "  // 5. Start delivery polls\n",
      `// @nanoclaw-agenttrace:index-boot:begin\n  await startAgentTrace();\n  // 5. Start delivery polls\n`
    );
    const repaired = insertAgentTraceBootBlockContent(incomplete);
    expect(
      repaired.match(/@nanoclaw-agenttrace:index-boot:begin/g)?.length
    ).toBe(1);
    expect(repaired.match(/@nanoclaw-agenttrace:index-boot:end/g)?.length).toBe(
      1
    );
    expect(repaired.match(/startAgentTrace\(\)/g)?.length).toBe(1);
  });

  it("install scavenges current-header rationale left by unbalanced strip", () => {
    const currentOrphan = `  // Register container-env contributor BEFORE the first wake/spawn.
  // Host-sweep and delivery polls can wake containers for due messages
  // immediately; if startAgentTrace runs after that, the first container
  // boots without AGENTTRACE_ENABLED and observe stays fail-closed
  // (host silence keepalives still fire, but no tool/thinking traces).
`;
    const incomplete = STOCK_MAIN.replace(
      "  // 5. Start delivery polls\n",
      `// @nanoclaw-agenttrace:index-boot:begin\n${currentOrphan}  await startAgentTrace();\n  // 5. Start delivery polls\n`
    );
    const repaired = insertAgentTraceBootBlockContent(incomplete);
    expect(repaired.match(/Register container-env contributor/g)?.length).toBe(
      1
    );
    expect(repaired.match(/startAgentTrace\(\)/g)?.length).toBe(1);
    expect(repaired).toContain("@nanoclaw-agenttrace:index-boot:end");
  });

  it("uninstall throws on unbalanced begin/end markers", () => {
    const unbalanced = `${BOOT_BEGIN_LINE}\n  realCode();\n${AGENTTRACE_BOOT_BLOCK}\n`;
    expect(() => removeAgentTraceBootBlockContent(unbalanced)).toThrow(
      /unbalanced markers/
    );
  });
});
