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

3. Remove from `src/index.ts` the marked boot block (begin → end, inclusive):
   ```ts
   // @nanoclaw-agenttrace:index-boot:begin
   // ... rationale comments ...
   const { startAgentTrace } = await import('./agenttrace-boot.js');
   await startAgentTrace();
   // @nanoclaw-agenttrace:index-boot:end
   ```
   Also delete any leftover unmarked `startAgentTrace` import/await pair and any
   orphan “Agenttrace must register its container-env…” comment block from
   pre-marker installs.

4. Remove from `container/agent-runner/src/index.ts`:
   ```ts
   import './agenttrace/register.js'; // @nanoclaw-agenttrace-runner
   ```

5. Leave all `@nanoclaw-hosthooks` marker blocks and both `hosthooks.ts`
   registry modules in place. They are owned by `nanoclaw-hosthooks`, not
   agenttrace.

6. Remove `.env` keys: `AGENTTRACE_ENABLED`, `AGENTTRACE_DEFAULT_VISIBILITY`, `AGENTTRACE_SILENCE_KEEPALIVE`

7. Remove skill folder: `.claude/skills/add-agenttrace/`

8. `pnpm remove nanoclaw-agenttrace` (if still listed)

9. Rebuild host + container image and restart
