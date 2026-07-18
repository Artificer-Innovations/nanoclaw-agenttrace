/** CI-only stub — real module exists once installed into a NanoClaw host. */
import type Database from 'better-sqlite3';
import type { Session } from './types.js';

export type DeliveryActionHandler = (
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
) => Promise<void>;

export type Unguarded = { unguarded: true; reason: string };

export function registerDeliveryAction(
  _action: string,
  _handler: DeliveryActionHandler,
  _unguardedDecl: Unguarded,
): void {}
