/** CI-only stub — real module exists once installed into a NanoClaw host. */
import type { Session } from '../types.js';

export interface AgentGroup {
  id: string;
  name: string;
  folder: string;
}

export interface MessagingGroup {
  id: string;
  channel_type: string;
  platform_id: string;
  instance?: string;
}

export function getAgentGroup(_id: string): AgentGroup | undefined {
  return undefined;
}

export function getMessagingGroup(_id: string): MessagingGroup | undefined {
  return undefined;
}

export function getActiveSessions(): Session[] {
  return [];
}
