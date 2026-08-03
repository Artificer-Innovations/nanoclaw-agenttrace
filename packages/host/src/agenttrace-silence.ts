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
/** Sessions that already showed a terminal sticky status — skip keepalives. */
const terminalSessions = new Map<string, true>();

let timer: ReturnType<typeof setInterval> | null = null;

export function noteActivitySeen(
  sessionId: string,
  atMs: number = Date.now(),
  meta?: { kind?: string },
): void {
  lastActivityAt.set(sessionId, atMs);
  firedThresholds.delete(sessionId);
  // Guest stall errors (and turn_end) must not be overwritten by
  // "Still running — Working" keepalives while processing_ack is still set.
  if (meta?.kind === 'error' || meta?.kind === 'turn_end') {
    terminalSessions.set(sessionId, true);
  } else if (meta?.kind) {
    terminalSessions.delete(sessionId);
  }
}

/** True after a delivered `error` / `turn_end` until a non-terminal activity arrives. */
export function isSilenceTerminal(sessionId: string): boolean {
  return terminalSessions.has(sessionId);
}

/** Drop bookkeeping for sessions that are no longer active. */
export function evictInactiveSilenceState(activeIds: ReadonlySet<string>): void {
  for (const id of lastActivityAt.keys()) {
    if (!activeIds.has(id)) lastActivityAt.delete(id);
  }
  for (const id of firedThresholds.keys()) {
    if (!activeIds.has(id)) firedThresholds.delete(id);
  }
  for (const id of terminalSessions.keys()) {
    if (!activeIds.has(id)) terminalSessions.delete(id);
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
  terminalSessions.clear();
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

    // Heartbeat alone is not enough — warm idle containers stay heartbeating
    // between turns. Only emit #1440 keepalives while a turn is in flight.
    if (isSilenceTerminal(session.id)) continue;
    const midTurn = readMidTurnState(session.agent_group_id, session.id);
    if (!midTurn.active) continue;

    const last = lastActivityAt.get(session.id) ?? hbMtime;
    const quietFor = now - last;
    const fired = firedThresholds.get(session.id) ?? new Set<number>();

    for (const threshold of SILENCE_KEEPALIVE_THRESHOLDS_MS) {
      if (quietFor < threshold || fired.has(threshold)) continue;

      const mg = session.messaging_group_id ? getMessagingGroup(session.messaging_group_id) : undefined;
      if (!mg) continue;
      const agent = getAgentGroup(session.agent_group_id);
      if (!agent) continue;

      const tool = midTurn.tool;
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

function readMidTurnState(
  agentGroupId: string,
  sessionId: string,
): { active: boolean; tool: string | null } {
  try {
    const db = openOutboundDb(agentGroupId, sessionId);
    try {
      const processing = db
        .prepare("SELECT 1 AS ok FROM processing_ack WHERE status = 'processing' LIMIT 1")
        .get() as { ok: number } | undefined;
      const state = getContainerState(db);
      const tool = state?.current_tool ?? null;
      // In-reply stamp is set for the duration of a poll-loop batch.
      let inReply = false;
      try {
        const row = db
          .prepare("SELECT value, updated_at FROM session_state WHERE key = 'current_in_reply_to'")
          .get() as { value: string; updated_at: string } | undefined;
        if (row?.value) {
          const age = Date.now() - new Date(row.updated_at).getTime();
          inReply = Number.isFinite(age) && age < 30 * 60 * 1000;
        }
      } catch {
        /* older schema */
      }
      return { active: Boolean(processing) || Boolean(tool) || inReply, tool };
    } finally {
      db.close();
    }
  } catch {
    return { active: false, tool: null };
  }
}
