/** CI-only stub — real module exists once installed into a NanoClaw host. */
export function unguarded(reason: string): { unguarded: true; reason: string } {
  return { unguarded: true, reason };
}
