/**
 * Optional poll-loop helper — begin a trace turn when processing inbound msgs.
 * Installed at container/agent-runner/src/agenttrace/poll-hook.ts
 */
import { beginAgentTraceTurn, refreshAgentTraceVisibility } from './observe.js';

export function agentTraceOnInboundBatch(messageIds: string[]): void {
  refreshAgentTraceVisibility();
  beginAgentTraceTurn(messageIds[0] || `turn-${Date.now()}`);
}
