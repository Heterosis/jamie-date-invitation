import { defineConfig } from "vite";
import { githubPagesBase } from "./src/build/github-pages-base";

export default defineConfig({
  base: githubPagesBase(process.env.GITHUB_REPOSITORY, process.env.GITHUB_ACTIONS === "true"),
});
