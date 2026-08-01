import {
  MAX_EVENTS_PER_TURN,
  MAX_COMPLETED_TURNS,
  PARTIAL_TEXT_MIN_INTERVAL_MS,
  type AgentActivityEvent,
  type AgentActivityKind,
} from './types.js';

/** Kinds that must not be dropped when applying the per-turn cap. */
const PRESERVE_KINDS: Set<AgentActivityKind> = new Set([
  'turn_start',
  'turn_end',
  'tool_start',
  'tool_end',
  'error',
  'compaction',
  'keepalive',
  'runtime_status',
]);

export class TurnEventCap {
  private counts = new Map<string, number>();
  private lastPartialAt = new Map<string, number>();

  /** Returns false if the event should be dropped (cap or coalesce). */
  accept(event: AgentActivityEvent, nowMs: number = Date.now()): boolean {
    if (event.kind === 'partial_text') {
      const last = this.lastPartialAt.get(event.turnId) ?? 0;
      if (nowMs - last < PARTIAL_TEXT_MIN_INTERVAL_MS) return false;
      this.lastPartialAt.set(event.turnId, nowMs);
    }

    const n = this.counts.get(event.turnId) ?? 0;
    if (n >= MAX_EVENTS_PER_TURN && !PRESERVE_KINDS.has(event.kind)) {
      return false;
    }
    this.counts.set(event.turnId, n + 1);

    if (event.kind === 'turn_end') {
      this.pruneCompleted(event.turnId);
    }
    return true;
  }

  private pruneCompleted(justFinishedTurnId: string): void {
    // Keep bookkeeping bounded; actual DB pruning is host/container side.
    if (this.counts.size <= MAX_COMPLETED_TURNS) return;
    const keys = [...this.counts.keys()].filter((k) => k !== justFinishedTurnId);
    while (this.counts.size > MAX_COMPLETED_TURNS && keys.length > 0) {
      const drop = keys.shift()!;
      this.counts.delete(drop);
      this.lastPartialAt.delete(drop);
    }
  }

  reset(): void {
    this.counts.clear();
    this.lastPartialAt.clear();
  }
}
