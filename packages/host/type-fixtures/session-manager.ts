/** CI-only stub — real module exists once installed into a NanoClaw host. */
import type Database from 'better-sqlite3';

export function heartbeatPath(_agentGroupId: string, _sessionId: string): string {
  // Nonexistent sentinel so accidental runtime use fails closed
  // (fs.statSync throws and callers treat the session as not awake).
  return '/nonexistent/agenttrace-type-fixture/.heartbeat';
}

export function openOutboundDb(_agentGroupId: string, _sessionId: string): Database.Database {
  throw new Error('type-fixture openOutboundDb');
}
