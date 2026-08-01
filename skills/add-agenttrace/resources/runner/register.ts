/**
 * Agenttrace runner hosthook registrations.
 *
 * Loaded once from the agent-runner entry point so hot-path observers remain
 * synchronous and never import modules per message.
 */
import {
  registerInboundBatchObserver,
  registerProviderMessageObserver,
  registerProviderQueryOptionsContributor,
  registerProviderQueryStartObserver,
} from "../hosthooks.js";
import {
  agentTraceOnProviderQueryStart,
  agentTraceQueryOptions,
  observeClaudeSdkMessage,
} from "./observe.js";
import { agentTraceOnInboundBatch } from "./poll-hook.js";

registerProviderMessageObserver("agenttrace", (message, context) => {
  if (context.provider === "claude") observeClaudeSdkMessage(message);
});

registerProviderQueryOptionsContributor("agenttrace", (context) => {
  if (context.provider !== "claude") return {};
  return {
    includePartialMessages: true,
    ...agentTraceQueryOptions(),
  };
});

registerInboundBatchObserver("agenttrace", ({ messageIds }) => {
  agentTraceOnInboundBatch([...messageIds]);
});

registerProviderQueryStartObserver("agenttrace", (context) => {
  agentTraceOnProviderQueryStart(context);
});
