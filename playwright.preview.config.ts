import { defineConfig, devices } from "@playwright/test";
import { githubPagesBase } from "./src/build/github-pages-base";

const previewOrigin = "http://127.0.0.1:4174";
const previewBase = githubPagesBase(
  process.env.GITHUB_REPOSITORY,
  process.env.GITHUB_ACTIONS === "true",
);
const previewBaseUrl = new URL(previewBase, previewOrigin).toString();

export default defineConfig({
  testDir: "tests/production",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: previewBaseUrl,
    serviceWorkers: "block",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "vite preview --host 127.0.0.1 --port 4174 --strictPort",
    url: previewBaseUrl,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
