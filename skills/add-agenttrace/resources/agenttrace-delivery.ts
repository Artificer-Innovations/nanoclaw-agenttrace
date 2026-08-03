/**
 * Registers the agenttrace_activity system delivery action.
 * Copied into NanoClaw fork `src/`.
 */
import type Database from 'better-sqlite3';
import { registerDeliveryAction } from './delivery.js';
import { unguarded } from './guard/index.js';
import { getAgentGroup, getMessagingGroup } from './db/index.js';
import { log } from './log.js';
import type { Session } from './types.js';
import { dispatchActivity } from './agenttrace-dispatch.js';
import { AGENTTRACE_ACTION, sanitizeActivityEvent, type AgentActivityEvent } from './agenttrace-shared.js';
import { noteActivitySeen } from './agenttrace-silence.js';

let registered = false;

export function registerAgentTraceDelivery(): void {
  if (registered) return;
  registered = true;

  registerDeliveryAction(
    AGENTTRACE_ACTION,
    async (content, session, _inDb: Database.Database) => {
      const event = content.event as AgentActivityEvent | undefined;
      if (!event || typeof event !== 'object' || !event.kind || !event.turnId) {
        log.warn('agenttrace_activity missing event payload', { sessionId: session.id });
        return;
      }

      noteActivitySeen(session.id, Date.now(), { kind: event.kind });

      const dest = resolveDestination(session);
      if (!dest) {
        log.warn('agenttrace_activity: could not resolve destination', { sessionId: session.id });
        return;
      }

      await dispatchActivity(dest, sanitizeActivityEvent(enrichWithAgentIdentity(session, event)));
    },
    // Destination is strictly the session's messaging group — never content-controlled —
    // so deliver()/publishActivity can only touch that session's own thread.
    unguarded('session-scoped agent activity telemetry'),
  );
}

function enrichWithAgentIdentity(session: Session, event: AgentActivityEvent): AgentActivityEvent {
  if (event.agentName && event.agentFolder) return event;
  const agent = getAgentGroup(session.agent_group_id);
  if (!agent) return event;
  return {
    ...event,
    agentName: event.agentName || agent.name,
    agentFolder: event.agentFolder || agent.folder,
  };
}

/** Always resolve from the session's messaging group — ignore content routing fields. */
function resolveDestination(
  session: Session,
): { channelType: string; platformId: string; threadId: string | null; instance?: string } | null {
  if (!session.messaging_group_id) return null;
  const mg = getMessagingGroup(session.messaging_group_id);
  if (!mg) return null;
  return {
    channelType: mg.channel_type,
    platformId: mg.platform_id,
    threadId: session.thread_id,
    instance: mg.instance,
  };
}
