/**
 * Host-side runtime lifecycle activity — wake/start/stop status before a guest
 * turn exists. Copied into NanoClaw fork `src/`.
 *
 * Callers (agenthosts wake bookends, Fly/Docker/process drivers) should never
 * hard-depend on this module failing: publishRuntimeActivity never throws.
 */
import { getAgentGroup, getMessagingGroup } from './db/index.js';
import { log } from './log.js';
import { resolveAgentTraceConfig } from './agenttrace-config.js';
import { dispatchActivity } from './agenttrace-dispatch.js';
import { readEnvFile } from './env.js';
import {
  sanitizeActivityEvent,
  type AgentActivityEvent,
  type RuntimeActivityPhase,
} from './agenttrace-shared.js';

export type RuntimeActivityState = 'started' | 'progress' | 'succeeded' | 'failed';

export interface RuntimeActivitySession {
  id: string;
  agent_group_id: string;
  messaging_group_id?: string | null;
  thread_id?: string | null;
}

export interface PublishRuntimeActivityInput {
  phase: RuntimeActivityPhase | string;
  summary: string;
  state?: RuntimeActivityState;
  replaceKey?: string;
  turnId?: string;
  seq?: number;
}

const seqBySession = new Map<string, number>();

function nextSeq(sessionId: string, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    seqBySession.set(sessionId, explicit);
    return explicit;
  }
  const n = (seqBySession.get(sessionId) ?? 0) + 1;
  seqBySession.set(sessionId, n);
  return n;
}

function isEnabled(): boolean {
  try {
    const fileEnv = readEnvFile([
      'AGENTTRACE_ENABLED',
      'AGENTTRACE_DEFAULT_VISIBILITY',
      'AGENTTRACE_SILENCE_KEEPALIVE',
    ]);
    return resolveAgentTraceConfig(process.env, fileEnv).enabled;
  } catch {
    const raw = (process.env.AGENTTRACE_ENABLED ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }
}

/**
 * Publish a host/runtime lifecycle status event to the session's messaging channel.
 * No-ops when agenttrace is disabled or the destination cannot be resolved.
 * Never throws into wake/kill paths.
 */
export async function publishRuntimeActivity(
  session: RuntimeActivitySession,
  input: PublishRuntimeActivityInput,
): Promise<void> {
  try {
    if (!isEnabled()) return;
    if (!session.messaging_group_id) return;

    const mg = getMessagingGroup(session.messaging_group_id);
    if (!mg) {
      log.warn('agenttrace runtime_status: could not resolve destination', {
        sessionId: session.id,
      });
      return;
    }

    const agent = getAgentGroup(session.agent_group_id);
    const turnId = input.turnId ?? `runtime:${session.id}`;
    const replaceKey = input.replaceKey ?? `runtime:${session.id}`;
    const seq = nextSeq(session.id, input.seq);

    const event: AgentActivityEvent = sanitizeActivityEvent({
      turnId,
      seq,
      timestamp: new Date().toISOString(),
      kind: 'runtime_status',
      summary: input.summary,
      phase: input.phase,
      replaceKey,
      agentName: agent?.name,
      agentFolder: agent?.folder,
    });

    // state is advisory for future renderers; fold into phase when failed/ready.
    void input.state;

    await dispatchActivity(
      {
        channelType: mg.channel_type,
        platformId: mg.platform_id,
        threadId: session.thread_id ?? null,
        instance: mg.instance,
      },
      event,
    );
  } catch (err) {
    log.warn('agenttrace runtime_status dispatch failed', {
      sessionId: session.id,
      phase: input.phase,
      err,
    });
  }
}

/** Test helper — clear per-session sequence counters. */
export function resetRuntimeActivitySeq(): void {
  seqBySession.clear();
}
