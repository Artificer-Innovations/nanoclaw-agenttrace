/** CI-only stub — real module exists once installed into a NanoClaw host. */
export interface Session {
  id: string;
  agent_group_id: string;
  messaging_group_id: string | null;
  thread_id: string | null;
}
