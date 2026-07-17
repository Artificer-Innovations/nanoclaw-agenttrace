# nanoclaw-agenttrace

Live **agent activity traces** for [NanoClaw](https://github.com/nanocoai/nanoclaw): tools, task progress, optional reasoning summaries, and silence keepalives during long turns.

Addresses [nanocoai/nanoclaw#1440](https://github.com/nanocoai/nanoclaw/issues/1440) (no intermediate feedback). Complements — does **not** implement — deep-session mode ([#1686](https://github.com/nanocoai/nanoclaw/issues/1686)).

## Why a skill / npm package

NanoClaw keeps trunk small. This ships as `nanoclaw-agenttrace` + `/add-agenttrace`, same pattern as `nanoclaw-webchat` and `nanoclaw-adminapi`. Installs that skip the skill see zero behavior change.

## Install

```bash
pnpm add nanoclaw-agenttrace@0.1.0
# or local peer:
pnpm add file:../nanoclaw-agenttrace

pnpm exec nanoclaw-agenttrace install
# set AGENTTRACE_ENABLED=true in .env
pnpm run build
./container/build.sh
pnpm exec nanoclaw-agenttrace verify
# restart host
```

## What you get

| Surface | Behavior |
|---------|----------|
| Webchat (with companion UI) | Collapsed per-turn activity timeline over WebSocket |
| Chat SDK channels | One sticky status message, edited in place |
| Typing-only channels | Typing refresh + silence keepalives |
| Others | Silent (final chat reply unchanged) |

## Privacy

- Never forwards thinking signatures or `redacted_thinking` data
- Redacts common secret patterns; truncates long text
- Visibility: `off` \| `status` \| `trace` \| `trace_reasoning` (default `trace`)

## Related prior art

- Fork-local Telegram “observer” patterns (stderr scrape) — this package uses session DB + delivery actions instead
- `/upload-trace` — post-hoc transcript upload; agenttrace is live UX

## License

MIT
