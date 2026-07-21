import { resolve } from "node:path";
import { defineConfig } from "vite";
import { githubPagesBase } from "./src/build/github-pages-base";

export default defineConfig({
  appType: "mpa",
  base: githubPagesBase(process.env.GITHUB_REPOSITORY, process.env.GITHUB_ACTIONS === "true"),
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        short: resolve(import.meta.dirname, "s/index.html"),
      },
    },
  },
});
