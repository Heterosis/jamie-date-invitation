import { expect, test, type Response } from "@playwright/test";

test("serves a complete invitation from the configured base URL", async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Runs only against the deployed Pages URL");
  const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL!);
  const expectedPagesPathPrefix = baseUrl.pathname.replace(/\/?$/, "/");
  const expectedAssetPathPrefix = `${baseUrl.pathname.replace(/\/?$/, "/")}assets/`;
  const assetResponses: Response[] = [];
  const requestFailures: string[] = [];
  const pageErrors: string[] = [];

  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.origin === baseUrl.origin && responseUrl.pathname.includes("/assets/")) {
      assetResponses.push(response);
    }
  });
  page.on("requestfailed", (request) => requestFailures.push(request.url()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const url = new URL(baseUrl);
  url.search = new URLSearchParams({
    to: "Jamie",
    from: "Alex",
    date: "2026-08-08",
    time: "19:30",
    tz: "Asia/Singapore",
    telegram: "alex_date",
    notifyName: "Alex",
  }).toString();

  const documentResponse = await page.goto(url.toString());
  if (!documentResponse) throw new Error("Navigation completed without a main document response");

  expect(documentResponse.ok(), `Main document returned HTTP ${documentResponse.status()}`).toBe(true);
  expect(
    (await documentResponse.headerValue("content-type")) ?? "",
    "Main document must be HTML",
  ).toMatch(/^text\/html(?:;|$)/i);
  await expect(page.getByRole("heading", { name: "Jamie, will you go on a date with me?" })).toBeVisible();
  await expect(page.locator("[data-letter]")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });

  const faviconLinks = page.locator('link[rel~="icon"]');
  await expect(faviconLinks, "Invitation must declare exactly one favicon link").toHaveCount(1);
  const favicon = faviconLinks.first();
  await expect(favicon, "Favicon link must use rel=icon").toHaveAttribute("rel", "icon");
  await expect(favicon, "Favicon link must declare SVG content").toHaveAttribute("type", "image/svg+xml");
  const faviconUrl = await favicon.evaluate((element) => (element as HTMLLinkElement).href);
  const faviconResponse = await page.request.get(faviconUrl);

  expect(
    new URL(faviconUrl).pathname.startsWith(expectedPagesPathPrefix),
    `${faviconUrl} escaped the configured Pages base ${expectedPagesPathPrefix}`,
  ).toBe(true);
  expect(faviconResponse.ok(), `${faviconUrl} returned HTTP ${faviconResponse.status()}`).toBe(true);
  expect(
    faviconResponse.headers()["content-type"] ?? "",
    `${faviconUrl} must return SVG content`,
  ).toMatch(/^image\/svg\+xml(?:;|$)/i);

  const assets = await Promise.all(assetResponses.map(async (response) => ({
    contentType: (await response.headerValue("content-type")) ?? "",
    ok: response.ok(),
    pathname: new URL(response.url()).pathname,
    resourceType: response.request().resourceType(),
    status: response.status(),
    url: response.url(),
  })));
  const fonts = assets.filter(({ resourceType }) => resourceType === "font");
  const scripts = assets.filter(({ resourceType }) => resourceType === "script");
  const stylesheets = assets.filter(({ resourceType }) => resourceType === "stylesheet");

  expect(fonts, "Browser did not receive a bundled font asset response").not.toHaveLength(0);
  expect(scripts, "Browser did not receive a JavaScript asset response").not.toHaveLength(0);
  expect(stylesheets, "Browser did not receive a stylesheet asset response").not.toHaveLength(0);
  for (const asset of assets) {
    expect(asset.ok, `${asset.url} returned HTTP ${asset.status}`).toBe(true);
    expect(
      asset.pathname.startsWith(expectedAssetPathPrefix),
      `${asset.pathname} escaped the configured Pages base ${expectedAssetPathPrefix}`,
    ).toBe(true);
  }
  for (const stylesheet of stylesheets) {
    expect(stylesheet.contentType, `${stylesheet.url} must return CSS`).toMatch(/^text\/css(?:;|$)/i);
  }
  for (const font of fonts) {
    expect(font.contentType, `${font.url} must return a font`).toMatch(/^font\//i);
  }
  for (const script of scripts) {
    expect(script.contentType, `${script.url} must return JavaScript`).toMatch(
      /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i,
    );
  }
  expect(requestFailures, "Browser requests failed before receiving a response").toEqual([]);
  expect(pageErrors, "The deployed page raised uncaught JavaScript errors").toEqual([]);
});
