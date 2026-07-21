import { stat } from "node:fs/promises";
import { resolve } from "node:path";
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

function normalizedBaseUrl(value: string): URL {
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

async function expectBuiltAssets(
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

  expect(fonts, "Recipient did not receive a bundled font response").not.toHaveLength(0);
  expect(scripts, "Recipient did not receive a bundled script response").not.toHaveLength(0);
  expect(stylesheets, "Recipient did not receive a bundled stylesheet response").not.toHaveLength(0);

  for (const asset of assets) {
    expect(asset.status, `${asset.url} did not return an exact HTTP 200`).toBe(200);
    expect(
      asset.pathname.startsWith(expectedAssetPathPrefix),
      `${asset.pathname} is not beneath the built asset base ${expectedAssetPathPrefix}`,
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

test("serves a real built short invitation and repository-base assets", async ({
  baseURL,
  browser,
  request,
}, testInfo) => {
  if (!baseURL) throw new Error("Production preview requires a configured baseURL");
  const configuredBase = normalizedBaseUrl(baseURL);
  const expectedShortPath = `${configuredBase.pathname}s/`;
  const expectedAssetPathPrefix = `${configuredBase.pathname}assets/`;

  for (const outputPath of [
    resolve("dist", "index.html"),
    resolve("dist", "s", "index.html"),
  ]) {
    expect((await stat(outputPath)).isFile(), `${outputPath} must be a real file`).toBe(true);
  }

  const missingUrl = new URL("__known-missing-short-route__.html", configuredBase);
  missingUrl.searchParams.set("cacheBust", `${Date.now()}-${testInfo.retry}`);
  const missingResponse = await request.get(missingUrl.toString());
  expect(
    missingResponse.status(),
    `${missingUrl.pathname} must prove MPA fallback behavior with an exact 404`,
  ).toBe(404);

  const makerContext = await browser.newContext({
    baseURL: configuredBase.toString(),
    serviceWorkers: "block",
  });
  let recipientContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const makerPage = await makerContext.newPage();
    await makerPage.goto("?make=1");
    await makerPage.getByLabel("To", { exact: true }).fill("Production Morgan");
    await makerPage.getByLabel("From").fill("Production Riley");
    await makerPage.getByLabel("Date").fill("2026-08-08");
    await makerPage.getByLabel("Time").fill("19:30");
    await makerPage.getByLabel("IANA zone").selectOption("Asia/Singapore");
    await makerPage.getByLabel("Place").fill("Botanic Gardens");
    await makerPage.getByLabel("Invitation note").fill("Bring your favorite story.");

    const generatedField = makerPage.getByLabel("Generated invitation URL");
    await expect(generatedField).not.toHaveValue("");
    const generatedHref = await generatedField.inputValue();
    const generatedUrl = new URL(generatedHref);
    expect(generatedUrl.origin).toBe(configuredBase.origin);
    expect(generatedUrl.pathname).toBe(expectedShortPath);
    expect(generatedUrl.search).toBe("");
    expect(generatedUrl.hash).toMatch(/^#[A-Za-z0-9_-]+$/);

    recipientContext = await browser.newContext({ serviceWorkers: "block" });
    const recipientPage = await recipientContext.newPage();
    const recipientCapture = captureRuntime(recipientPage, configuredBase.origin);
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
      name: "Production Morgan, will you go on a date with me?",
    })).toBeVisible();
    await expect(recipientPage.getByText("Bring your favorite story.", { exact: true })).toBeVisible();
    await expect(recipientPage.locator("[data-date]")).toHaveText("Saturday, August 8, 2026");
    await expect(recipientPage.locator("[data-time]")).toHaveText("7:30 PM");
    await expect(recipientPage.locator("[data-place]")).toHaveText("Botanic Gardens");
    await expect(recipientPage.locator("[data-signature]")).toHaveText("from Production Riley");
    await recipientPage.evaluate(async () => { await document.fonts.ready; });

    await expectBuiltAssets(recipientCapture.assetResponses, expectedAssetPathPrefix);
    expect(recipientCapture.requestFailures, "Recipient requests must not fail").toEqual([]);
    expect(recipientCapture.pageErrors, "Recipient page must not raise errors").toEqual([]);
  } finally {
    await recipientContext?.close();
    await makerContext.close();
  }
});
