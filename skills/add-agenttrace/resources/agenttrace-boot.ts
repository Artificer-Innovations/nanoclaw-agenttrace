/**
 * Skill entry point — start agenttrace when enabled.
 * Copied into NanoClaw fork `src/`.
 */
import { resolveAgentTraceConfig } from './agenttrace-config.js';
import { registerAgentTraceDelivery } from './agenttrace-delivery.js';
import { agentTraceContainerEnv } from './agenttrace-env.js';
import { startSilenceKeepalive, stopSilenceKeepalive } from './agenttrace-silence.js';
import { readEnvFile } from './env.js';
import { registerContainerEnvContributor } from './hosthooks.js';
import { log } from './log.js';
import { onShutdown } from './response-registry.js';

export async function startAgentTrace(): Promise<void> {
  const fileEnv = readEnvFile([
    'AGENTTRACE_ENABLED',
    'AGENTTRACE_DEFAULT_VISIBILITY',
    'AGENTTRACE_SILENCE_KEEPALIVE',
  ]);
  const config = resolveAgentTraceConfig(process.env, fileEnv);

  if (!config.enabled) {
    log.info('Agenttrace disabled (AGENTTRACE_ENABLED not set)');
    return;
  }

  registerAgentTraceDelivery();
  registerContainerEnvContributor('agenttrace', agentTraceContainerEnv);

  if (config.silenceKeepalive) {
    startSilenceKeepalive();
    onShutdown(() => {
      stopSilenceKeepalive();
    });
  }

  log.info('Agenttrace enabled', {
    visibility: config.defaultVisibility,
    silenceKeepalive: config.silenceKeepalive,
  });
}
