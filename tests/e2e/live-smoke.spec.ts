import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

const ASSET_RESOURCE_TYPES = new Set(["font", "script", "stylesheet"]);

interface RuntimeCapture {
  readonly assetResponses: Response[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
}

function deployedBaseUrl(): URL {
  const value = process.env.PLAYWRIGHT_BASE_URL;
  if (!value) throw new Error("PLAYWRIGHT_BASE_URL is required for deployed smoke tests");
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/?$/, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function captureRuntime(page: Page, expectedOrigin: string): RuntimeCapture {
  const capture: RuntimeCapture = {
    assetResponses: [],
    pageErrors: [],
    requestFailures: [],
  };
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (
      responseUrl.origin === expectedOrigin
      && ASSET_RESOURCE_TYPES.has(response.request().resourceType())
    ) {
      capture.assetResponses.push(response);
    }
  });
  page.on("requestfailed", (request: Request) => {
    capture.requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? "unknown error"}`);
  });
  page.on("pageerror", (error) => capture.pageErrors.push(error.message));

  return capture;
}

async function expectSvgFavicon(page: Page, expectedFaviconUrl: string): Promise<void> {
  const faviconLinks = page.locator('link[rel~="icon"]');
  await expect(faviconLinks, "Invitation must declare exactly one favicon link").toHaveCount(1);
  const favicon = faviconLinks.first();
  await expect(favicon, "Favicon link must use rel=icon").toHaveAttribute("rel", "icon");
  await expect(favicon, "Favicon link must declare SVG content").toHaveAttribute(
    "type",
    "image/svg+xml",
  );

  const faviconUrl = await favicon.evaluate((element) => (element as HTMLLinkElement).href);
  expect(
    faviconUrl,
    `Favicon must resolve exactly to the configured Pages SVG URL ${expectedFaviconUrl}`,
  ).toBe(expectedFaviconUrl);
  const response = await page.request.get(faviconUrl);

  expect(response.status(), `${faviconUrl} must return exact HTTP 200`).toBe(200);
  expect(
    response.headers()["content-type"] ?? "",
    `${faviconUrl} must return SVG content`,
  ).toMatch(/^image\/svg\+xml(?:;|$)/i);
}

async function expectDeployedAssets(
  responses: readonly Response[],
  expectedAssetPathPrefix: string,
): Promise<void> {
  const assets = await Promise.all(responses.map(async (response) => ({
    contentType: (await response.headerValue("content-type")) ?? "",
    pathname: new URL(response.url()).pathname,
    resourceType: response.request().resourceType(),
    status: response.status(),
    url: response.url(),
  })));
  const fonts = assets.filter(({ resourceType }) => resourceType === "font");
  const scripts = assets.filter(({ resourceType }) => resourceType === "script");
  const stylesheets = assets.filter(({ resourceType }) => resourceType === "stylesheet");

  expect(fonts, "Browser did not receive a bundled font response").not.toHaveLength(0);
  expect(scripts, "Browser did not receive a bundled script response").not.toHaveLength(0);
  expect(stylesheets, "Browser did not receive a bundled stylesheet response").not.toHaveLength(0);

  for (const asset of assets) {
    expect(asset.status, `${asset.url} did not return an exact HTTP 200`).toBe(200);
    expect(
      asset.pathname.startsWith(expectedAssetPathPrefix),
      `${asset.pathname} escaped the configured Pages asset base ${expectedAssetPathPrefix}`,
    ).toBe(true);
  }
  for (const stylesheet of stylesheets) {
    expect(stylesheet.contentType, `${stylesheet.url} must return CSS`).toMatch(
      /^text\/css(?:;|$)/i,
    );
  }
  for (const font of fonts) {
    expect(font.contentType, `${font.url} must return a font`).toMatch(/^font\//i);
  }
  for (const script of scripts) {
    expect(script.contentType, `${script.url} must return JavaScript`).toMatch(
      /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i,
    );
  }
}

test("serves a complete legacy query invitation from the deployed base URL", async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Runs only against the deployed Pages URL");
  const baseUrl = deployedBaseUrl();
  const expectedAssetPathPrefix = `${baseUrl.pathname}assets/`;
  const runtime = captureRuntime(page, baseUrl.origin);

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
  if (!documentResponse) throw new Error("Legacy navigation had no main document response");

  expect(documentResponse.status(), "Legacy document must return exact HTTP 200").toBe(200);
  expect(new URL(documentResponse.url()).pathname).toBe(baseUrl.pathname);
  expect(
    (await documentResponse.headerValue("content-type")) ?? "",
    "Legacy document must return HTML",
  ).toMatch(/^text\/html(?:;|$)/i);
  expect(new URL(page.url()).pathname).toBe(baseUrl.pathname);
  await expect(page.getByRole("heading", { name: "Jamie, will you go on a date with me?" })).toBeVisible();
  await expect(page.locator("[data-letter]")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });

  await expectSvgFavicon(page, new URL("favicon.svg", baseUrl).href);
  await expectDeployedAssets(runtime.assetResponses, expectedAssetPathPrefix);
  expect(runtime.requestFailures, "Legacy invitation requests must not fail").toEqual([]);
  expect(runtime.pageErrors, "Legacy invitation page must not raise errors").toEqual([]);
});

test("opens a dynamically generated short invitation in a fresh deployed context", async ({
  browser,
}) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Runs only against the deployed Pages URL");
  const baseUrl = deployedBaseUrl();
  const expectedShortPath = `${baseUrl.pathname}s/`;
  const expectedAssetPathPrefix = `${baseUrl.pathname}assets/`;
  const makerContext = await browser.newContext({ serviceWorkers: "block" });
  let recipientContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const makerPage = await makerContext.newPage();
    await makerPage.goto(new URL("?make=1", baseUrl).toString());
    await makerPage.getByLabel("To", { exact: true }).fill("Deployed Morgan");
    await makerPage.getByLabel("From").fill("Deployed Riley");
    await makerPage.getByLabel("Date").fill("2026-08-08");
    await makerPage.getByLabel("Time").fill("19:30");
    await makerPage.getByLabel("IANA zone").selectOption("Asia/Singapore");
    await makerPage.getByLabel("Place").fill("Botanic Gardens");
    await makerPage.getByLabel("Invitation note").fill("Bring your favorite story.");

    const generatedField = makerPage.getByLabel("Generated invitation URL");
    await expect(generatedField).not.toHaveValue("");
    const generatedHref = await generatedField.inputValue();
    const generatedUrl = new URL(generatedHref);
    expect(generatedUrl.origin).toBe(baseUrl.origin);
    expect(generatedUrl.pathname).toBe(expectedShortPath);
    expect(generatedUrl.search).toBe("");
    expect(generatedUrl.hash).toMatch(/^#[A-Za-z0-9_-]+$/);

    recipientContext = await browser.newContext({ serviceWorkers: "block" });
    const recipientPage = await recipientContext.newPage();
    const runtime = captureRuntime(recipientPage, baseUrl.origin);
    const documentResponse = await recipientPage.goto(generatedHref);
    if (!documentResponse) throw new Error("Short-link navigation had no main document response");

    expect(documentResponse.status(), "Short-link document must return exact HTTP 200").toBe(200);
    expect(new URL(documentResponse.url()).pathname).toBe(expectedShortPath);
    expect(
      (await documentResponse.headerValue("content-type")) ?? "",
      "Short-link document must return HTML",
    ).toMatch(/^text\/html(?:;|$)/i);
    expect(await recipientPage.evaluate(() => location.href)).toBe(generatedHref);
    expect(new URL(recipientPage.url()).pathname).toBe(expectedShortPath);
    await expect(recipientPage.getByRole("heading", {
      level: 1,
      name: "Deployed Morgan, will you go on a date with me?",
    })).toBeVisible();
    await expect(recipientPage.getByText("Bring your favorite story.", { exact: true })).toBeVisible();
    await expect(recipientPage.locator("[data-date]")).toHaveText("Saturday, August 8, 2026");
    await expect(recipientPage.locator("[data-time]")).toHaveText("7:30 PM");
    await expect(recipientPage.locator("[data-place]")).toHaveText("Botanic Gardens");
    await expect(recipientPage.locator("[data-signature]")).toHaveText("from Deployed Riley");
    await recipientPage.evaluate(async () => { await document.fonts.ready; });

    await expectSvgFavicon(recipientPage, new URL("favicon.svg", baseUrl).href);
    await expectDeployedAssets(runtime.assetResponses, expectedAssetPathPrefix);
    expect(runtime.requestFailures, "Short invitation requests must not fail").toEqual([]);
    expect(runtime.pageErrors, "Short invitation page must not raise errors").toEqual([]);
  } finally {
    await recipientContext?.close();
    await makerContext.close();
  }
});
