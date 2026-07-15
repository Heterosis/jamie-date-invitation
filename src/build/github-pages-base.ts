export function githubPagesBase(repository: string | undefined, inActions: boolean): string {
  const name = repository?.split("/")[1];
  return inActions && name ? `/${name}/` : "/";
}
