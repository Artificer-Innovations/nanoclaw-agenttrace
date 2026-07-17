/**
 * Duck-typed channel dispatch for activity events.
 * Copied into NanoClaw fork `src/`.
 */
import { getChannelAdapterExact } from './channels/channel-registry.js';
import { log } from './log.js';
import { formatStatusLine, type AgentActivityEvent } from './agenttrace-shared.js';

export interface ActivityDestination {
  channelType: string;
  platformId: string;
  threadId: string | null;
  instance?: string;
}

type PublishActivityFn = (
  platformId: string,
  threadId: string | null,
  event: AgentActivityEvent,
) => Promise<void>;

type DeliverFn = (
  platformId: string,
  threadId: string | null,
  message: { kind: string; content: unknown },
) => Promise<string | undefined>;

type SetTypingFn = (platformId: string, threadId: string | null) => Promise<void>;

interface DuckAdapter {
  publishActivity?: PublishActivityFn;
  clearActivity?: (platformId: string, threadId: string | null, turnId?: string) => Promise<void>;
  deliver?: DeliverFn;
  setTyping?: SetTypingFn;
  /** Sticky status message ids for edit-in-place (Chat SDK). */
  _agenttraceStatusMsg?: Map<string, string>;
}

function stickyKey(dest: ActivityDestination): string {
  return `${dest.instance ?? dest.channelType}:${dest.platformId}:${dest.threadId ?? ''}`;
}

/**
 * Publish one activity event to the destination channel.
 * Degradation ladder: publishActivity → edit-in-place → setTyping → silent.
 */
export async function dispatchActivity(
  dest: ActivityDestination,
  event: AgentActivityEvent,
): Promise<void> {
  const adapter = getChannelAdapterExact(dest.instance ?? dest.channelType) as DuckAdapter | undefined;
  if (!adapter) {
    log.warn('agenttrace: no adapter for destination', {
      channelType: dest.channelType,
      instance: dest.instance,
    });
    return;
  }

  if (typeof adapter.publishActivity === 'function') {
    await adapter.publishActivity(dest.platformId, dest.threadId, event);
    return;
  }

  // Edit-in-place sticky status via existing deliver(operation: edit|chat)
  if (typeof adapter.deliver === 'function' && event.kind !== 'turn_end') {
    const text = formatStatusLine(event);
    const key = stickyKey(dest);
    adapter._agenttraceStatusMsg ??= new Map();
    const existingId = adapter._agenttraceStatusMsg.get(key);

    if (existingId) {
      try {
        await adapter.deliver(dest.platformId, dest.threadId, {
          kind: 'chat',
          content: { operation: 'edit', messageId: existingId, text, markdown: text },
        });
        return;
      } catch (err) {
        log.warn('agenttrace: edit-in-place failed, will repost', { err });
        adapter._agenttraceStatusMsg.delete(key);
      }
    }

    try {
      const id = await adapter.deliver(dest.platformId, dest.threadId, {
        kind: 'chat',
        content: { text, markdown: text },
      });
      if (id) adapter._agenttraceStatusMsg.set(key, id);
      return;
    } catch (err) {
      log.warn('agenttrace: status deliver failed, falling back to typing', { err });
    }
  }

  if (event.kind === 'turn_end' && typeof adapter.clearActivity === 'function') {
    await adapter.clearActivity(dest.platformId, dest.threadId, event.turnId);
    return;
  }

  if (typeof adapter.setTyping === 'function' && event.kind !== 'turn_end') {
    await adapter.setTyping(dest.platformId, dest.threadId);
  }
}
