/**
 * Optional poll-loop helper — prepare a trace turn when claiming inbound msgs.
 * Installed at container/agent-runner/src/agenttrace/poll-hook.ts
 */
import { prepareAgentTraceTurn, refreshAgentTraceVisibility } from './observe.js';

export function agentTraceOnInboundBatch(messageIds: string[]): void {
  refreshAgentTraceVisibility();
  prepareAgentTraceTurn(messageIds[0] || `turn-${Date.now()}`);
}
