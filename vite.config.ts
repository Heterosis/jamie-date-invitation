import { defineConfig } from "vite";

export function githubPagesBase(
  repository = process.env.GITHUB_REPOSITORY,
  inActions = process.env.GITHUB_ACTIONS === "true",
): string {
  const name = repository?.split("/")[1];
  return inActions && name ? `/${name}/` : "/";
}

export default defineConfig({ base: githubPagesBase() });
