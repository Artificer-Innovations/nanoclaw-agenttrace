/**
 * Write activity events as system messages_out for host delivery action.
 * Installed at container/agent-runner/src/agenttrace/writer.ts
 */
import { randomUUID } from 'node:crypto';
import { writeMessageOut } from '../db/messages-out.js';
import { getSessionRouting } from '../db/session-routing.js';
import { getOutboundDb } from '../db/connection.js';
import {
  AGENTTRACE_ACTION,
  MAX_COMPLETED_TURNS,
  MAX_EVENTS_PER_TURN,
  type AgentActivityEvent,
  type AgentActivityKind,
} from './types.js';
import { sanitizeActivityEvent } from './sanitize.js';

/** Kinds that must not be dropped when applying the per-turn cap (sync with shared/caps.ts). */
const PRESERVE_KINDS: Set<AgentActivityKind> = new Set([
  'turn_start',
  'turn_end',
  'tool_start',
  'tool_end',
  'error',
  'compaction',
  'keepalive',
]);

const turnCounts = new Map<string, number>();
/** Message ids written per turn — enables O(1) prune without scanning messages_out. */
const turnMessageIds = new Map<string, string[]>();
const MAX_TRACKED_TURNS = MAX_COMPLETED_TURNS * 2;

export function writeActivityEvent(event: AgentActivityEvent): void {
  const sanitized = sanitizeActivityEvent(event);
  if (!sanitized) return;

  const n = turnCounts.get(sanitized.turnId) ?? 0;
  if (n >= MAX_EVENTS_PER_TURN && !PRESERVE_KINDS.has(sanitized.kind)) {
    return;
  }
  turnCounts.set(sanitized.turnId, n + 1);

  const routing = getSessionRouting();
  const id = `agenttrace-${randomUUID()}`;

  writeMessageOut({
    id,
    kind: 'system',
    platform_id: routing.platform_id,
    channel_type: routing.channel_type,
    thread_id: routing.thread_id,
    content: JSON.stringify({
      action: AGENTTRACE_ACTION,
      event: sanitized,
      // Duplicate routing for host resolver convenience (host ignores these
      // for destination — session messaging group is authoritative).
      channel_type: routing.channel_type,
      platform_id: routing.platform_id,
      thread_id: routing.thread_id,
    }),
  });

  const ids = turnMessageIds.get(sanitized.turnId) ?? [];
  ids.push(id);
  turnMessageIds.set(sanitized.turnId, ids);

  if (sanitized.kind === 'turn_end') {
    pruneCompletedTurns(sanitized.turnId);
  }
  evictOrphanBookkeeping(sanitized.turnId);
}

function pruneCompletedTurns(keepTurnId: string): void {
  const keys = [...turnMessageIds.keys()];
  if (keys.length <= MAX_COMPLETED_TURNS) return;
  const dropCount = keys.length - MAX_COMPLETED_TURNS;
  const drop = keys.slice(0, dropCount).filter((k) => k !== keepTurnId);
  if (drop.length === 0) return;

  try {
    const db = getOutboundDb();
    for (const tid of drop) {
      for (const mid of turnMessageIds.get(tid) ?? []) {
        db.prepare('DELETE FROM messages_out WHERE id = ?').run(mid);
      }
      turnMessageIds.delete(tid);
      turnCounts.delete(tid);
    }
  } catch {
    /* best-effort prune */
  }
}

/** Bound in-memory maps even when turns never emit turn_end (crash/kill). */
function evictOrphanBookkeeping(keepTurnId: string): void {
  while (turnCounts.size > MAX_TRACKED_TURNS) {
    const oldest = turnCounts.keys().next().value;
    if (!oldest || oldest === keepTurnId) break;
    turnCounts.delete(oldest);
    turnMessageIds.delete(oldest);
  }
}
