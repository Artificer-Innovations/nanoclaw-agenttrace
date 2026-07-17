/**
 * Forward AGENTTRACE_* host settings into agent containers.
 * Copied into NanoClaw fork `src/`.
 *
 * Container observe is fail-closed on AGENTTRACE_ENABLED — without these `-e`
 * args the host silence keepalives still fire (typing bubbles) but tool/status
 * traces never leave the container.
 */
import { readEnvFile } from './env.js';

const KEYS = [
  'AGENTTRACE_ENABLED',
  'AGENTTRACE_DEFAULT_VISIBILITY',
  'AGENTTRACE_VISIBILITY',
] as const;

/** Docker `-e` args for agenttrace container env. */
export function agentTraceEnvArgs(
  env: NodeJS.ProcessEnv = process.env,
  fileEnv?: Record<string, string | undefined>,
): string[] {
  const fromFile = fileEnv ?? readEnvFile([...KEYS]);
  const args: string[] = [];
  for (const key of KEYS) {
    const value = (env[key] ?? fromFile[key] ?? '').trim();
    if (!value) continue;
    args.push('-e', `${key}=${value}`);
  }
  return args;
}
