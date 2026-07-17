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

export function writeActivityEvent(event: AgentActivityEvent): void {
  const sanitized = sanitizeActivityEvent(event);
  if (!sanitized) return;

  const n = turnCounts.get(sanitized.turnId) ?? 0;
  if (n >= MAX_EVENTS_PER_TURN && !PRESERVE_KINDS.has(sanitized.kind)) {
    return;
  }
  turnCounts.set(sanitized.turnId, n + 1);

  const routing = getSessionRouting();

  writeMessageOut({
    id: `agenttrace-${randomUUID()}`,
    kind: 'system',
    platform_id: routing.platform_id,
    channel_type: routing.channel_type,
    thread_id: routing.thread_id,
    content: JSON.stringify({
      action: AGENTTRACE_ACTION,
      event: sanitized,
      // Duplicate routing for host resolver convenience
      channel_type: routing.channel_type,
      platform_id: routing.platform_id,
      thread_id: routing.thread_id,
    }),
  });

  if (sanitized.kind === 'turn_end') {
    pruneOldActivity(sanitized.turnId);
  }
}

function pruneOldActivity(keepTurnId: string): void {
  try {
    const db = getOutboundDb();
    // Delete oldest activity system rows beyond retention, keeping current turn
    const rows = db
      .prepare(
        `SELECT id, content FROM messages_out
         WHERE kind = 'system' AND content LIKE '%"action":"agenttrace_activity"%'
         ORDER BY timestamp DESC`,
      )
      .all() as Array<{ id: string; content: string }>;

    const turnIds: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.content) as { event?: { turnId?: string } };
        const tid = parsed.event?.turnId;
        if (!tid || seen.has(tid)) continue;
        seen.add(tid);
        turnIds.push(tid);
      } catch {
        /* skip */
      }
    }

    if (turnIds.length <= MAX_COMPLETED_TURNS) return;
    const drop = new Set(turnIds.slice(MAX_COMPLETED_TURNS));
    drop.delete(keepTurnId);

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.content) as { event?: { turnId?: string } };
        if (parsed.event?.turnId && drop.has(parsed.event.turnId)) {
          db.prepare('DELETE FROM messages_out WHERE id = ?').run(row.id);
        }
      } catch {
        /* skip */
      }
    }

    for (const tid of drop) turnCounts.delete(tid);
  } catch {
    /* best-effort prune */
  }
}
