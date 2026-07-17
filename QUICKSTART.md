# Quickstart — nanoclaw-agenttrace

## 1. Install into your NanoClaw fork

```bash
cd /path/to/nanoclaw
pnpm add nanoclaw-agenttrace@0.1.0   # or: pnpm add file:../nanoclaw-agenttrace
pnpm exec nanoclaw-agenttrace install
```

## 2. Enable

Edit `.env`:

```
AGENTTRACE_ENABLED=true
AGENTTRACE_DEFAULT_VISIBILITY=trace
AGENTTRACE_SILENCE_KEEPALIVE=true
```

For reasoning summaries in the UI: deferred past 0.1.0 — `trace_reasoning` is reserved but not emitted yet.

**Note:** install patches the Claude provider with `includePartialMessages: true` so stream deltas can be observed. That SDK option applies to every session once the patch is installed, even when `AGENTTRACE_ENABLED=false` (events are still not written unless enabled).

The host wiring structural test (`agenttrace-wiring.test.ts`) imports the `typescript` package to walk the AST — NanoClaw forks already have it as a devDependency; keep it if you run host unit tests after install.

## 3. Build & restart

```bash
pnpm run build
./container/build.sh
# restart NanoClaw host (launchctl / systemd)
pnpm exec nanoclaw-agenttrace verify
```

## 4. See it

Send a message that triggers tools. You should get:

- Webchat: activity timeline (if webchat companion is present)
- Slack/Telegram/etc.: sticky “Running Bash” / keepalives while quiet
- Typing indicators continue to work as before

## Uninstall

```bash
pnpm exec nanoclaw-agenttrace uninstall
pnpm remove nanoclaw-agenttrace
pnpm run build && ./container/build.sh
# restart host
```
