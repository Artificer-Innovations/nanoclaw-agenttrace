---
name: add-agenttrace
description: Add live agent activity traces (tools, tasks, reasoning summaries, silence keepalives) via nanoclaw-agenttrace. Installs host sidecar + container observe patches.
---

# /add-agenttrace — Live Agent Activity Trace

Surfaces what the agent is doing during long turns — tools, task progress, optional reasoning summaries, and silence keepalives — without polluting chat history on rich channels.

Addresses [nanocoai/nanoclaw#1440](https://github.com/nanocoai/nanoclaw/issues/1440). Does **not** implement deep-session mode (#1686).

See also: [QUICKSTART.md](../../QUICKSTART.md) in the npm package.

## Prerequisites

- Working NanoClaw v2 install with `pnpm`
- Node.js ≥ 20 (22 recommended)

## Architecture

```
Claude SDK → agenttrace observe (container)
                ↓
         messages_out system action
                ↓
         host delivery action → channel (timeline | edit status | typing)
```

## Recipe order

```
/add-webchat       # optional — richest timeline UI
/add-agenttrace    # this skill
```

## Install

### Pre-flight (idempotent)

Skip to **Enable** if all of these are already in place:

- `src/agenttrace-boot.ts` exists
- `container/agent-runner/src/agenttrace/observe.ts` exists
- `src/index.ts` contains `await startAgentTrace()`
- `nanoclaw-agenttrace` is listed in `package.json`

Otherwise continue. Every step is safe to re-run.

### 0. Sync this skill (first time only)

```bash
pnpm exec nanoclaw-agenttrace sync-skill
```

### 1. Install npm package

```bash
pnpm add nanoclaw-agenttrace@0.1.0
```

Local peer monorepo:

```bash
pnpm add file:../nanoclaw-agenttrace
```

### 2. Run the installer

```bash
pnpm exec nanoclaw-agenttrace install
```

This will:

1. Copy host adapter sources into `src/agenttrace-*.ts`
2. Copy runner modules into `container/agent-runner/src/agenttrace/`
3. Insert the `startAgentTrace()` boot block in `src/index.ts`
4. Patch `providers/claude.ts` with observe + `includePartialMessages` + summarized-thinking SDK options
5. Optionally patch `poll-loop.ts` for turn_start hooks
6. Scaffold `.env` keys (`AGENTTRACE_ENABLED=false` by default)
7. Sync this skill to `.claude/skills/add-agenttrace/`

### 3. Enable

In `.env`:

```
AGENTTRACE_ENABLED=true
AGENTTRACE_DEFAULT_VISIBILITY=trace
AGENTTRACE_SILENCE_KEEPALIVE=true
```

### 4. Build, rebuild container, verify

```bash
pnpm run build
./container/build.sh
pnpm exec nanoclaw-agenttrace verify
# restart host
```

Run host wiring test when present:

```bash
pnpm exec vitest run src/agenttrace-wiring.test.ts src/agenttrace-config.test.ts src/agenttrace-dispatch.test.ts
```

### 5. Webchat companion (optional)

If `nanoclaw-webchat` is installed, upgrade it to **≥ 0.3.1** (implements `publishActivity` + activity WebSocket events) for the collapsible timeline:

```bash
pnpm webchat:local   # or: pnpm add nanoclaw-webchat@0.3.1 && pnpm exec nanoclaw-webchat install
```

Typing continues to work as a floor signal even without the timeline.

## Uninstall

See [REMOVE.md](REMOVE.md).

## Visibility levels

| Value | Shows |
|-------|--------|
| `off` | Nothing |
| `status` | Tools / tasks / keepalives (no reasoning or partial text) |
| `trace` (default) | Status + partial text + **Anthropic summarized reasoning** |
| `trace_reasoning` | Alias of `trace` (compat; no raw CoT mode — API does not expose raw CoT) |
| `trace_full` | Everything in `trace` plus tool inputs/results and subagent transcripts |

Host default: `AGENTTRACE_DEFAULT_VISIBILITY`. Per-group override (container env / config blob): `activity_visibility` or `AGENTTRACE_VISIBILITY` at spawn — no trunk CRUD change required if you set it in the group's container config JSON.

## Retention

Bounded per session: max 200 events/turn (500 under `trace_full`), ~4 KiB/event summary, prune oldest activity rows beyond 50 turns. Activity never replaces the final chat reply.
