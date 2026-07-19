# Changelog

## 0.3.0

### Minor Changes

- [#10](https://github.com/Artificer-Innovations/nanoclaw-agenttrace/pull/10) [`f54e28e`](https://github.com/Artificer-Innovations/nanoclaw-agenttrace/commit/f54e28e9d6c9f0802d4aba13b09bfb19a0f3a579) Thanks [@ZappoMan](https://github.com/ZappoMan)! - Require nanoclaw-hosthooks API v1 and register agenttrace container environment,
  Claude observation/query options, and inbound batch handling through its
  registries instead of patching NanoClaw business files directly.

## 0.2.0

### Minor Changes

- [#5](https://github.com/Artificer-Innovations/nanoclaw-agenttrace/pull/5) — Summarized reasoning under default `trace` + opt-in `trace_full` firehose.

**Upgrade note:** existing installs with `AGENTTRACE_ENABLED=true` and the default `trace` visibility will begin receiving Anthropic **summarized** reasoning (`reasoning_summary`) on the activity timeline after upgrade + reinstall/rebuild — no new env var required. Opt out with `AGENTTRACE_VISIBILITY=status` (or `off`). The optional `trace_full` firehose remains opt-in only.

- Forward Anthropic **summarized** thinking under default `trace` (`reasoning_summary`), coalesced from `thinking_delta` / completed thinking blocks and secret-scanned before write
- Request `thinking: { type: "adaptive", display: "summarized" }` from the Claude provider when agenttrace visibility is `trace`+ (SDK options now call `agentTraceQueryOptions()` — no duplicated env parse in the patch snippet)
- Add opt-in `trace_full` firehose: tool inputs, tool result snippets, subagent text (`forwardSubagentText`), faster coalesce, 500 events/turn cap
- Keep `trace_reasoning` as a compat alias of `trace` (no raw CoT — not available from the API)
- Pass active visibility into the container writer sanitize + per-turn cap path
- Never forward thinking signatures or `redacted_thinking` payloads
- Cap coalesced thinking buffer before flush; pair `tool_end.tool` with the tool name from `tool_start` (not the opaque tool_use id)

### Patch Changes

- [#8](https://github.com/Artificer-Innovations/nanoclaw-agenttrace/pull/8) — Fix the Claude SDK options splice silently disabling summarized thinking and `trace_full` subagent forwarding. Replace the invalid synchronous `require()` of ESM `observe.js` with a bridge registered during the existing awaited import, log once when an enabled install is missing the bridge, and self-heal stale splice blocks during upgrade. Add a regression test that executes the splice as a real ES module.

## 0.1.0

- Initial release: host delivery action, container Claude observe patch, silence keepalives (#1440), `/add-agenttrace` skill
- Redaction via `@sanity-labs/secret-scan@1.1.0` (same library as Skein)
- Session-scoped destination resolution (ignore content routing fields)
- Dispatch ladder catches `publishActivity`/`clearActivity` failures and falls through
- Writer tracks message ids per turn (no LIKE full-table prune) and caps orphan turn maps
- Forward `AGENTTRACE_*` into containers via `container-runner` (observe is fail-closed without it)
- CI typecheck includes `packages/host` via `type-fixtures/` stubs for NanoClaw host modules (shared + cli + host)
