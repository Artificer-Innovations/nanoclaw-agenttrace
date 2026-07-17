/**
 * Agenttrace host config — resolved from process.env + optional .env map.
 * Copied into NanoClaw fork `src/`.
 */
import { parseVisibility, type ActivityVisibility } from './agenttrace-shared.js';

export interface AgentTraceConfig {
  enabled: boolean;
  defaultVisibility: ActivityVisibility;
  silenceKeepalive: boolean;
}

export function resolveAgentTraceConfig(
  env: Record<string, string | undefined>,
  fileEnv: Record<string, string | undefined> = {},
): AgentTraceConfig {
  const get = (key: string): string | undefined => env[key] ?? fileEnv[key];

  const enabledRaw = (get('AGENTTRACE_ENABLED') ?? '').trim().toLowerCase();
  const enabled = enabledRaw === '1' || enabledRaw === 'true' || enabledRaw === 'yes';

  const visibility = parseVisibility(get('AGENTTRACE_DEFAULT_VISIBILITY') ?? 'trace');

  const silenceRaw = (get('AGENTTRACE_SILENCE_KEEPALIVE') ?? 'true').trim().toLowerCase();
  const silenceKeepalive = silenceRaw !== '0' && silenceRaw !== 'false' && silenceRaw !== 'no';

  return {
    enabled,
    defaultVisibility: enabled ? visibility : 'off',
    silenceKeepalive: enabled && silenceKeepalive,
  };
}
