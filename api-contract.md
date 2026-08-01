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

| kind | Meaning |
|------|---------|
| `turn_start` / `turn_end` | Turn lifecycle |
| `reasoning_summary` | Anthropic **summarized** thinking (coalesced); never raw CoT / signatures / `redacted_thinking` |
| `partial_text` | Coalesced partial assistant text |
| `tool_start` / `tool_progress` / `tool_end` | Tool lifecycle |
| `task_progress` | Subagent / task updates |
| `retry` / `error` / `compaction` | Provider lifecycle |
| `keepalive` | Silence-timer synthetic status (#1440) |
| `runtime_status` | Host/runtime lifecycle (wake, start, stop, provision) — emitted on the host via `publishRuntimeActivity`, not from the guest observer |

### Host runtime activity

When agenttrace is enabled, host code (agenthosts wake bookends, runtime drivers) may call:

```ts
publishRuntimeActivity(session, {
  phase: 'starting',           // RuntimeActivityPhase
  summary: 'Starting machine…',
  state?: 'started' | 'progress' | 'succeeded' | 'failed',
})
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

| Key | Default | Meaning |
|-----|---------|---------|
| `AGENTTRACE_ENABLED` | `false` | Master switch |
| `AGENTTRACE_DEFAULT_VISIBILITY` | `trace` | `off` \| `status` \| `trace` \| `trace_reasoning` (alias of `trace`) \| `trace_full` |
| `AGENTTRACE_SILENCE_KEEPALIVE` | `true` | #1440 silence timers |
| `AGENTTRACE_VISIBILITY` | (inherits) | Optional container override |

### Visibility notes

| Value | Behavior |
|-------|----------|
| `status` | Tools / tasks / keepalives / runtime status only |
| `trace` (default) | + partial text + summarized reasoning |
| `trace_reasoning` | Same as `trace` (compat alias; no raw mode) |
| `trace_full` | + tool inputs/results + subagent transcripts; higher per-turn event cap (500) |
