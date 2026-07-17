/** CI-only stub — real module exists once installed into a NanoClaw host. */
import type Database from 'better-sqlite3';

export function heartbeatPath(_agentGroupId: string, _sessionId: string): string {
  return '';
}

export function openOutboundDb(_agentGroupId: string, _sessionId: string): Database.Database {
  throw new Error('type-fixture openOutboundDb');
}
