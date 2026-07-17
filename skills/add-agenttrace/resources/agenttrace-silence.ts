/**
 * #1440 silence-timer keepalive — emit status when a session is awake but quiet.
 * Copied into NanoClaw fork `src/`.
 */
import { getActiveSessions, getAgentGroup, getMessagingGroup } from './db/index.js';
import { getContainerState } from './db/session-db.js';
import { openOutboundDb, heartbeatPath } from './session-manager.js';
import { log } from './log.js';
import { dispatchActivity } from './agenttrace-dispatch.js';
import { SILENCE_KEEPALIVE_THRESHOLDS_MS, type AgentActivityEvent } from './agenttrace-shared.js';
import fs from 'node:fs';

const lastActivityAt = new Map<string, number>();
const firedThresholds = new Map<string, Set<number>>();

let timer: ReturnType<typeof setInterval> | null = null;

export function noteActivitySeen(sessionId: string, atMs: number = Date.now()): void {
  lastActivityAt.set(sessionId, atMs);
  firedThresholds.delete(sessionId);
}

/** Drop bookkeeping for sessions that are no longer active. */
export function evictInactiveSilenceState(activeIds: ReadonlySet<string>): void {
  for (const id of lastActivityAt.keys()) {
    if (!activeIds.has(id)) lastActivityAt.delete(id);
  }
  for (const id of firedThresholds.keys()) {
    if (!activeIds.has(id)) firedThresholds.delete(id);
  }
}

export function startSilenceKeepalive(intervalMs = 5_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick().catch((err) => log.warn('agenttrace silence tick failed', { err }));
  }, intervalMs);
  // Don't keep the process alive solely for keepalives
  timer.unref?.();
}

export function stopSilenceKeepalive(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  lastActivityAt.clear();
  firedThresholds.clear();
}

async function tick(): Promise<void> {
  const now = Date.now();
  const sessions = getActiveSessions();
  const activeIds = new Set(sessions.map((s) => s.id));
  evictInactiveSilenceState(activeIds);

  for (const session of sessions) {
    const hb = heartbeatPath(session.agent_group_id, session.id);
    let hbMtime = 0;
    try {
      hbMtime = fs.statSync(hb).mtimeMs;
    } catch {
      continue; // no heartbeat → not awake
    }
    // Stale heartbeat (>90s) → container likely gone
    if (now - hbMtime > 90_000) continue;

    const last = lastActivityAt.get(session.id) ?? hbMtime;
    const quietFor = now - last;
    const fired = firedThresholds.get(session.id) ?? new Set<number>();

    for (const threshold of SILENCE_KEEPALIVE_THRESHOLDS_MS) {
      if (quietFor < threshold || fired.has(threshold)) continue;

      const mg = session.messaging_group_id ? getMessagingGroup(session.messaging_group_id) : undefined;
      if (!mg) continue;
      const agent = getAgentGroup(session.agent_group_id);
      if (!agent) continue;

      const tool = readCurrentTool(session.agent_group_id, session.id);
      const summary = tool || 'Working';

      const event: AgentActivityEvent = {
        turnId: `keepalive:${session.id}`,
        seq: threshold,
        timestamp: new Date().toISOString(),
        kind: 'keepalive',
        summary,
        tool: tool ?? undefined,
        replaceKey: `keepalive:${session.id}`,
        keepalive: true,
        agentName: agent.name,
        agentFolder: agent.folder,
      };

      try {
        await dispatchActivity(
          {
            channelType: mg.channel_type,
            platformId: mg.platform_id,
            threadId: session.thread_id,
            instance: mg.instance,
          },
          event,
        );
        fired.add(threshold);
        firedThresholds.set(session.id, fired);
        log.info('agenttrace keepalive', { sessionId: session.id, threshold, tool });
      } catch (err) {
        // Do not mark fired — retry on next tick (claim-after-success).
        log.warn('agenttrace keepalive dispatch failed', { sessionId: session.id, threshold, err });
      }
    }
  }
}

function readCurrentTool(agentGroupId: string, sessionId: string): string | null {
  try {
    const db = openOutboundDb(agentGroupId, sessionId);
    try {
      const state = getContainerState(db);
      return state?.current_tool ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
