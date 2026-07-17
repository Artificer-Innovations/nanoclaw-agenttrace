/**
 * Registers the agenttrace_activity system delivery action.
 * Copied into NanoClaw fork `src/`.
 */
import type Database from 'better-sqlite3';
import { registerDeliveryAction } from './delivery.js';
import { unguarded } from './guard/index.js';
import { getAgentGroup, getMessagingGroup, getMessagingGroupByPlatform } from './db/index.js';
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

      noteActivitySeen(session.id);

      const dest = resolveDestination(session, content);
      if (!dest) {
        log.warn('agenttrace_activity: could not resolve destination', { sessionId: session.id });
        return;
      }

      await dispatchActivity(dest, sanitizeActivityEvent(enrichWithAgentIdentity(session, event)));
    },
    unguarded('agent activity telemetry — no privileged side effects'),
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

function resolveDestination(
  session: Session,
  content: Record<string, unknown>,
): { channelType: string; platformId: string; threadId: string | null; instance?: string } | null {
  // Prefer routing fields on the outbound row (passed through content by writer)
  const channelType =
    (typeof content.channel_type === 'string' && content.channel_type) ||
    (typeof content.channelType === 'string' && content.channelType) ||
    null;
  const platformId =
    (typeof content.platform_id === 'string' && content.platform_id) ||
    (typeof content.platformId === 'string' && content.platformId) ||
    null;
  const threadId =
    typeof content.thread_id === 'string'
      ? content.thread_id
      : typeof content.threadId === 'string'
        ? content.threadId
        : session.thread_id;

  if (channelType && platformId) {
    const originMg = session.messaging_group_id ? getMessagingGroup(session.messaging_group_id) : undefined;
    const mg =
      originMg && originMg.channel_type === channelType && originMg.platform_id === platformId
        ? originMg
        : getMessagingGroupByPlatform(channelType, platformId);
    return {
      channelType,
      platformId,
      threadId: threadId ?? null,
      instance: mg?.instance,
    };
  }

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
