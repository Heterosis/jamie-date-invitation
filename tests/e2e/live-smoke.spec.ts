import { expect, test } from "@playwright/test";

test("serves a complete invitation from the configured base URL", async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Runs only against the deployed Pages URL");
  const url = new URL(process.env.PLAYWRIGHT_BASE_URL!);
  url.search = new URLSearchParams({
    to: "Jamie",
    from: "Alex",
    date: "2026-08-08",
    time: "19:30",
    tz: "Asia/Singapore",
    telegram: "alex_date",
    notifyName: "Alex",
  }).toString();

  await page.goto(url.toString());

  await expect(page.getByRole("heading", { name: "Jamie, will you go on a date with me?" })).toBeVisible();
  await expect(page.locator("[data-letter]")).toBeVisible();
  expect(
    (await page.locator('link[rel="stylesheet"]').count()) + (await page.locator("style").count()),
  ).toBeGreaterThan(0);
});
