import { expect, test } from "@playwright/test";

test("renders URL-provided invitation content", async ({ page }) => {
  await page.goto("/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&place=Botanic+Gardens&note=Bring+a+smile");
  await expect(page.getByRole("heading", { name: "Jamie, will you go on a date with me?" })).toBeVisible();
  await expect(page.getByText("Bring a smile")).toBeVisible();
  await expect(page.getByText("Saturday, August 8, 2026")).toBeVisible();
  await expect(page.getByText("7:30 PM")).toBeVisible();
  await expect(page.getByText("Botanic Gardens")).toBeVisible();
  await expect(page.getByText("from Alex")).toBeVisible();
});

test("renders romantic fallbacks without inventing calendar facts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Date to be decided")).toBeVisible();
  await expect(page.getByText("Time to be decided")).toBeVisible();
  await expect(page.getByText("A little surprise ✦")).toBeVisible();
  await expect(page.getByText("from someone with butterflies")).toBeVisible();
});

test("inserts URL content as text rather than HTML", async ({ page }) => {
  await page.goto(`/?to=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByRole("heading")).toContainText("<img src=x onerror=alert(1)>");
});

test("fits a 320px viewport without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/?to=Jamie");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
