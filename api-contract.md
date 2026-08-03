# nanoclaw-agenttrace API contract

## Overview

Agenttrace surfaces **live agent activity** (tools, tasks, keepalives, Anthropic summarized reasoning; optional `trace_full` firehose) without changing NanoClaw trunk delivery for chat.

```
Claude SDK → container observe → messages_out (kind=system, action=agenttrace_activity)
                                      ↓
                              host delivery action
                                      ↓
                    publishActivity | edit-in-place | typing | silent
```

## System outbound payload

`messages_out.kind = "system"`

```json
{
  "action": "agenttrace_activity",
  "event": {
    "turnId": "msg-…",
    "seq": 3,
    "timestamp": "2026-07-16T21:00:00.000Z",
    "kind": "tool_start",
    "summary": "Running Bash",
    "tool": "Bash",
    "replaceKey": "turn:msg-…",
    "keepalive": false
  },
  "channel_type": "web",
  "platform_id": "lobby",
  "thread_id": "main"
}
```

### Event kinds

| kind                                        | Meaning                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `turn_start` / `turn_end`                   | Turn lifecycle                                                                                                                        |
| `reasoning_summary`                         | Anthropic **summarized** thinking (coalesced); never raw CoT / signatures / `redacted_thinking`                                       |
| `partial_text`                              | Coalesced partial assistant text                                                                                                      |
| `tool_start` / `tool_progress` / `tool_end` | Tool lifecycle                                                                                                                        |
| `task_progress`                             | Subagent / task updates                                                                                                               |
| `retry` / `error` / `compaction`            | Provider lifecycle                                                                                                                    |
| `keepalive`                                 | Silence-timer synthetic status (#1440)                                                                                                |
| `runtime_status`                            | Host/runtime lifecycle (wake, start, stop, provision) — emitted on the host via `publishRuntimeActivity`, not from the guest observer |

### Host runtime activity

When agenttrace is enabled, host code (agenthosts wake bookends, runtime drivers) may call:

```ts
publishRuntimeActivity(session, {
  phase: "starting", // RuntimeActivityPhase
  summary: "Starting machine…",
  state: "progress", // optional: "started" | "progress" | "succeeded" | "failed"
});
```

Events use `kind: 'runtime_status'`, default `turnId` / `replaceKey` of `runtime:${sessionId}`, and the same channel dispatch ladder as other activity. Allowed under visibility `status` and above.

## Channel duck-typing

Adapters may implement:

```ts
publishActivity?(platformId: string, threadId: string | null, event: AgentActivityEvent): Promise<void>
clearActivity?(platformId: string, threadId: string | null, turnId?: string): Promise<void>
```

Fallback ladder when `publishActivity` is absent (or throws):

1. `deliver` with sticky `operation: 'edit'` status text
2. `setTyping`
3. silent

Throws from a higher rung fall through to the next — telemetry must not abort delivery.

When `publishActivity` **is** present, `turn_end` still calls `clearActivity` afterward (if implemented) so rich UIs get an explicit clear signal.

**Destination:** host delivery always resolves the channel from `session.messaging_group_id` (never from content-supplied `platform_id` / `channel_type`). Content routing fields on the outbound row are informational only.

## WebSocket events (nanoclaw-webchat)

When webchat implements `publishActivity`:

```ts
{ type: 'activity', platformId, threadId, event: AgentActivityEvent }
{ type: 'activity_clear', platformId, threadId, turnId?: string }
```

## Env

| Key                             | Default    | Meaning                                                                              |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `AGENTTRACE_ENABLED`            | `false`    | Master switch                                                                        |
| `AGENTTRACE_DEFAULT_VISIBILITY` | `trace`    | `off` \| `status` \| `trace` \| `trace_reasoning` (alias of `trace`) \| `trace_full` |
| `AGENTTRACE_SILENCE_KEEPALIVE`  | `true`     | #1440 silence timers at 10s / 20s / 30s / 90s / 180s                                 |
| `AGENTTRACE_DARK_GAP_STALL_MS`  | `90000`    | Max ms after `provider_query` before sticky `error` if harness never starts          |
| `AGENTTRACE_VISIBILITY`         | (inherits) | Optional container override                                                          |

## Provider query-start ladder (hosthooks)

Requires `nanoclaw-hosthooks@^0.2.0` (`features.providerQueryStart`).

| Stage             | When                                     | Guest status                                           |
| ----------------- | ---------------------------------------- | ------------------------------------------------------ |
| _(inbound batch)_ | Messages claimed                         | Prepare turn id only (no Working…)                     |
| `provider_query`  | Immediately before `provider.query`      | `turn_start` → Working… (arms dark-gap stall timer)    |
| `sdk_query`       | Harness boot (Claude / Codex / OpenCode) | `task_progress` → Starting… or Restoring conversation… |
| `session_init`    | ProviderEvent `{ type: 'init' }`         | `task_progress` → Session ready…                       |
| _(stall)_         | No `sdk_query` / `session_init` within 90s after `provider_query` | `error` → Agent did not start (`phase: stall_provider_query`) |

The stall timer clears on `sdk_query`, `session_init`, turn prepare, or turn end. Override duration with `AGENTTRACE_DARK_GAP_STALL_MS` (ms). Host silence keepalives skip a session after a delivered `error` or `turn_end` (until a later non-terminal activity) so “Still running…” cannot overwrite the terminal sticky.

Claude-only (via `observeClaudeSdkMessage` on SDK system messages already flowing through hosthooks):

| SDK system subtype | Sticky copy |
| ------------------ | ----------- |
| `hook_started` (SessionStart / Setup / other) | Running session hooks… / Running setup hooks… / Running \<event\> hook… |
| `status: requesting` | Waiting for model… |
| `status: compacting` | Compacting context… |
| `init` with failed `mcp_servers` | MCP unavailable: … (Session ready… still comes from `session_init`) |

### Visibility notes

| Value             | Behavior                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| `status`          | Tools / tasks / keepalives / runtime status only                              |
| `trace` (default) | + partial text + summarized reasoning                                         |
| `trace_reasoning` | Same as `trace` (compat alias; no raw mode)                                   |
| `trace_full`      | + tool inputs/results + subagent transcripts; higher per-turn event cap (500) |
