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

For reasoning summaries in the UI: `AGENTTRACE_DEFAULT_VISIBILITY=trace_reasoning`.

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
