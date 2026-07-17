# Remove /add-agenttrace

Reverses every change from `nanoclaw-agenttrace install`.

## Automated

```bash
pnpm exec nanoclaw-agenttrace uninstall
pnpm remove nanoclaw-agenttrace
pnpm run build
./container/build.sh
# restart host
```

## Manual checklist

If the CLI is unavailable, reverse by hand:

1. Delete host files:
   - `src/agenttrace-shared.ts`
   - `src/agenttrace-config.ts`
   - `src/agenttrace-dispatch.ts`
   - `src/agenttrace-delivery.ts`
   - `src/agenttrace-silence.ts`
   - `src/agenttrace-boot.ts`
   - `src/agenttrace-config.test.ts` (if present)
   - `src/agenttrace-wiring.test.ts` (if present)
   - `src/agenttrace-dispatch.test.ts` (if present)

2. Delete runner directory: `container/agent-runner/src/agenttrace/`

3. Remove from `src/index.ts` the block:
   ```ts
   const { startAgentTrace } = await import('./agenttrace-boot.js');
   await startAgentTrace();
   ```

4. In `container/agent-runner/src/providers/claude.ts`, delete marked blocks:
   - `// @nanoclaw-agenttrace-observe-begin` … `// @nanoclaw-agenttrace-observe-end`
   - `// @nanoclaw-agenttrace-partial-begin` … `// @nanoclaw-agenttrace-partial-end`

5. In `container/agent-runner/src/poll-loop.ts`, delete:
   - `// @nanoclaw-agenttrace-poll-begin` … `// @nanoclaw-agenttrace-poll-end`

6. Remove `.env` keys: `AGENTTRACE_ENABLED`, `AGENTTRACE_DEFAULT_VISIBILITY`, `AGENTTRACE_SILENCE_KEEPALIVE`

7. Remove skill folder: `.claude/skills/add-agenttrace/`

8. `pnpm remove nanoclaw-agenttrace` (if still listed)

9. Rebuild host + container image and restart
