# Changelog

## 0.1.1

- Forward Anthropic **summarized** thinking under default `trace` (`reasoning_summary`), coalesced from `thinking_delta` / completed thinking blocks and secret-scanned before write
- Request `thinking: { type: "adaptive", display: "summarized" }` from the Claude provider when agenttrace visibility is `trace`+
- Add opt-in `trace_full` firehose: tool inputs, tool result snippets, subagent text (`forwardSubagentText`), faster coalesce, 500 events/turn cap
- Keep `trace_reasoning` as a compat alias of `trace` (no raw CoT — not available from the API)
- Pass active visibility into the container writer sanitize + per-turn cap path
- Never forward thinking signatures or `redacted_thinking` payloads

## 0.1.0

- Initial release: host delivery action, container Claude observe patch, silence keepalives (#1440), `/add-agenttrace` skill
- Redaction via `@sanity-labs/secret-scan@1.1.0` (same library as Skein)
- Session-scoped destination resolution (ignore content routing fields)
- Dispatch ladder catches `publishActivity`/`clearActivity` failures and falls through
- Writer tracks message ids per turn (no LIKE full-table prune) and caps orphan turn maps
- Forward `AGENTTRACE_*` into containers via `container-runner` (observe is fail-closed without it)
- CI typecheck includes `packages/host` via `type-fixtures/` stubs for NanoClaw host modules (shared + cli + host)
