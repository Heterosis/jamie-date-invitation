import { expect, test } from "@playwright/test";

test("loads the invitation shell", async ({ page }) => {
  await page.goto("/?to=Jamie");
  await expect(page.getByRole("heading", { name: /Jamie, will you go on a date with me\?/i })).toBeVisible();
});

test("binds the query recipient to the heading", async ({ page }) => {
  await page.goto("/?to=Taylor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Taylor, will you go on a date with me?");
});

test("serves an SVG favicon", async ({ page }) => {
  await page.goto("/?to=Jamie");

  const favicon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(favicon, "Invitation must declare exactly one SVG favicon").toHaveCount(1);

  const faviconUrl = await favicon.evaluate((element) => (element as HTMLLinkElement).href);
  const response = await page.request.get(faviconUrl);

  expect(response.ok(), `${faviconUrl} returned HTTP ${response.status()}`).toBe(true);
  expect(
    response.headers()["content-type"] ?? "",
    `${faviconUrl} must return SVG content`,
  ).toMatch(/^image\/svg\+xml(?:;|$)/i);
});
