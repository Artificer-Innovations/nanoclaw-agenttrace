/** CI-only stub — real module exists once installed into a NanoClaw host. */
import type Database from 'better-sqlite3';

export interface ContainerState {
  current_tool: string | null;
}

export function getContainerState(_outDb: Database.Database): ContainerState | null {
  return null;
}
