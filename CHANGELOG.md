# Changelog

## 0.5.0

### Minor Changes

- Delay `turn_start` (“Working…”) until the hosthooks `provider_query` stage so inbound claim no longer freezes the UI during harness boot.
- Emit sticky harness status on `sdk_query` (Claude / Codex / OpenCode start or restore) and `Session ready…` on provider-neutral `session_init`.
- Surface Claude SDK startup system messages already on the observer path: `hook_started` (session/setup hooks), `status: requesting|compacting` (waiting for model), and failed `mcp_servers` on `init`.
- Lower silence keepalive thresholds to `[10s, 20s, 30s, 90s, 180s]`.
- Require `nanoclaw-hosthooks@^0.2.0` (`features.providerQueryStart` + new call-site markers).

## 0.4.0

### Minor Changes

- Add `runtime_status` activity kind and host `publishRuntimeActivity()` for harness/runtime lifecycle status (wake, start, stop, provision) before a guest turn exists.

### Patch Changes

- Fix host boot install/uninstall idempotency: use `@nanoclaw-agenttrace:index-boot` markers (rationale included), insert before delivery polls / peer boots, scavenge pre-marker late boots and orphan rationale comments, require paired begin/end (repair on install, throw on unbalanced uninstall). Re-run `pnpm exec nanoclaw-agenttrace install` (or upgrade) after updating.

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
- Opt-in `trace_full` firehose for tool inputs/results and subagent transcripts
- Higher per-turn event cap under `trace_full` (500)

## 0.1.0

### Minor Changes

- Initial published release of nanoclaw-agenttrace.
