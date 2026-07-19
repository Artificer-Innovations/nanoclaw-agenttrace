export type ContainerEnvContributor = () =>
  | Record<string, string | undefined>
  | null
  | undefined;

export function registerContainerEnvContributor(
  _name: string,
  _contributor: ContainerEnvContributor,
): () => void {
  return () => {};
}
