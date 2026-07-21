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

  const faviconLinks = page.locator('link[rel~="icon"]');
  await expect(faviconLinks, "Invitation must declare exactly one favicon link").toHaveCount(1);
  const favicon = faviconLinks.first();
  await expect(favicon, "Favicon link must use rel=icon").toHaveAttribute("rel", "icon");
  await expect(favicon, "Favicon link must declare SVG content").toHaveAttribute("type", "image/svg+xml");

  const faviconUrl = await favicon.evaluate((element) => (element as HTMLLinkElement).href);
  const expectedFaviconUrl = new URL("/favicon.svg", page.url()).href;
  expect(
    faviconUrl,
    `Favicon must resolve exactly to the configured SVG URL ${expectedFaviconUrl}`,
  ).toBe(expectedFaviconUrl);
  const response = await page.request.get(faviconUrl);

  expect(response.ok(), `${faviconUrl} returned HTTP ${response.status()}`).toBe(true);
  expect(
    response.headers()["content-type"] ?? "",
    `${faviconUrl} must return SVG content`,
  ).toMatch(/^image\/svg\+xml(?:;|$)/i);
});
