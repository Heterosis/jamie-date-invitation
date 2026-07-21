import { expect, test, type Page } from "@playwright/test";
import { parseInvitationConfig } from "../../src/domain/invitation-config";
import { isShareableInvitationConfig } from "../../src/short-url/payload-schema";
import { buildShortInvitationUrl } from "../../src/short-url/short-url";

const INVALID_HEADING = "This invitation link couldn't be opened.";
const INVALID_GUIDANCE = "Please ask the sender for a new link.";

function validShortUrl(overrides: Readonly<Record<string, string>> = {}): URL {
  const config = parseInvitationConfig(new URLSearchParams({
    to: "Morgan",
    from: "Riley",
    date: "2026-08-08",
    time: "19:30",
    tz: "Asia/Singapore",
    duration: "90",
    place: "Botanic Gardens",
    title: "Sunset picnic",
    note: "Bring your favorite story.",
    telegram: "riley_dates",
    notifyName: "Riley",
    ...overrides,
  }).toString());
  if (!isShareableInvitationConfig(config)) {
    throw new Error("Test fixture must be shareable");
  }

  return buildShortInvitationUrl("https://invitation.test/", config, "/");
}

function shortRoute(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function envelopeBytes(url: URL): Buffer {
  return Buffer.from(url.hash.slice(1), "base64url");
}

function encodeEnvelope(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function invalidRoutes(): ReadonlyArray<{
  readonly name: string;
  readonly route: string;
  readonly token: string;
}> {
  const valid = validShortUrl();
  const validEnvelope = envelopeBytes(valid);

  const corruptEnvelope = validEnvelope.subarray(0, 2);
  const corruptToken = encodeEnvelope(corruptEnvelope);

  const unknownVersionEnvelope = Uint8Array.from(validEnvelope);
  unknownVersionEnvelope[0] = 0x02;
  const unknownVersionToken = encodeEnvelope(unknownVersionEnvelope);

  return [
    { name: "empty fragment", route: "/s/", token: "" },
    { name: "invalid alphabet", route: "/s/#bad.payload", token: "bad.payload" },
    { name: "corrupt compressed payload", route: `/s/#${corruptToken}`, token: corruptToken },
    { name: "unknown envelope version", route: `/s/#${unknownVersionToken}`, token: unknownVersionToken },
  ];
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("opens a compact invitation with its full schedule and response actions", async ({ page }) => {
  const pageErrors = capturePageErrors(page);

  await page.goto(shortRoute(validShortUrl()));

  await expect(page.getByRole("heading", {
    level: 1,
    name: "Morgan, will you go on a date with me?",
  })).toBeVisible();
  await expect(page.getByText("Bring your favorite story.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-date]")).toHaveText("Saturday, August 8, 2026");
  await expect(page.locator("[data-time]")).toHaveText("7:30 PM");
  await expect(page.locator("[data-place]")).toHaveText("Botanic Gardens");
  await expect(page.locator("[data-signature]")).toHaveText("from Riley");
  await expect(page.getByRole("button", { name: "YES, I'D LOVE TO" })).toBeVisible();
  await expect(page.getByRole("button", { name: "NO, SORRY" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("remounts compact invitations across valid and invalid fragment-only navigation", async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  const first = validShortUrl();
  const second = validShortUrl({
    to: "Avery",
    from: "Quinn",
    place: "Night Market",
    note: "Meet beside the lanterns.",
    telegram: "quinn_dates",
    notifyName: "Quinn",
  });

  await page.goto(shortRoute(first));
  await expect(page.getByRole("heading", {
    level: 1,
    name: "Morgan, will you go on a date with me?",
  })).toBeVisible();

  await page.evaluate((hash) => {
    location.hash = hash;
  }, second.hash);
  await expect.poll(() => new URL(page.url()).hash).toBe(second.hash);
  await expect(page.getByRole("heading", {
    level: 1,
    name: "Avery, will you go on a date with me?",
  })).toBeVisible();
  await expect(page.locator("[data-signature]")).toHaveText("from Quinn");
  await expect(page.locator("[data-place]")).toHaveText("Night Market");
  await expect(page.locator("[data-note]")).toHaveText("Meet beside the lanterns.");

  const currentInvitationUrl = page.url();
  await page.getByRole("button", { name: "YES, I'D LOVE TO" }).dispatchEvent("click");
  const telegram = page.getByRole("link", { name: "TELL QUINN ON TELEGRAM" });
  await expect(telegram).toBeVisible();
  const telegramHref = await telegram.getAttribute("href");
  if (!telegramHref) throw new Error("Missing remounted Telegram URL");
  const telegramUrl = new URL(telegramHref);
  expect(telegramUrl.origin + telegramUrl.pathname).toBe("https://t.me/quinn_dates");
  const draft = telegramUrl.searchParams.get("text");
  if (draft === null) throw new Error("Missing remounted Telegram draft");
  expect(draft.split(currentInvitationUrl)).toHaveLength(2);

  await page.evaluate(() => {
    location.hash = "#bad.payload";
  });
  await expect.poll(() => new URL(page.url()).hash).toBe("#bad.payload");
  await expect(page).toHaveTitle("Invitation link unavailable");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(INVALID_HEADING);
  await expect(page.getByText(INVALID_GUIDANCE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator("a")).toHaveCount(0);

  await page.evaluate((hash) => {
    location.hash = hash;
  }, first.hash);
  await expect.poll(() => new URL(page.url()).hash).toBe(first.hash);
  await expect(page).toHaveTitle("A tiny invitation");
  await expect(page.getByRole("heading", {
    level: 1,
    name: "Morgan, will you go on a date with me?",
  })).toBeVisible();
  await expect(page.locator("[data-signature]")).toHaveText("from Riley");
  await expect(page.getByRole("button", { name: "YES, I'D LOVE TO" })).toBeVisible();
  await expect(page.getByRole("button", { name: "NO, SORRY" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("short invitation routing ignores a maker query", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const url = validShortUrl();
  url.search = "?make=1";

  await page.goto(shortRoute(url));

  await expect(page.getByRole("heading", {
    level: 1,
    name: "Morgan, will you go on a date with me?",
  })).toBeVisible();
  await expect(page.locator("[data-maker-form]")).toHaveCount(0);
  await expect(page.getByLabel("Generated invitation URL")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("legacy root query invitations keep rendering their recipient", async ({ page }) => {
  const pageErrors = capturePageErrors(page);

  await page.goto("/?to=Legacy%20Taylor");

  await expect(page.getByRole("heading", {
    level: 1,
    name: "Legacy Taylor, will you go on a date with me?",
  })).toBeVisible();
  await expect(page.getByText(INVALID_HEADING, { exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

for (const { name, route, token } of invalidRoutes()) {
  test(`shows a generic inaccessible state for ${name}`, async ({ page }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(route);

    await expect(page).toHaveTitle("Invitation link unavailable");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(INVALID_HEADING);
    await expect(page.getByText(INVALID_GUIDANCE, { exact: true })).toBeVisible();
    await expect(page.locator("[data-maker-form]")).toHaveCount(0);
    await expect(page.getByLabel("Generated invitation URL")).toHaveCount(0);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator("a")).toHaveCount(0);
    if (token) await expect(page.locator("body")).not.toContainText(token);
    expect(pageErrors).toEqual([]);
  });
}

test("a maker-generated direct Telegram draft includes the exact short URL once", async ({
  page,
  context,
}) => {
  await page.goto("/?make=1");
  await page.getByLabel("From").fill("Alex");
  await page.getByLabel("Date").fill("2026-08-08");
  await page.getByLabel("Time").fill("19:30");
  await page.getByLabel("Telegram username").fill("alex_date");
  await page.getByLabel("Telegram display name").fill("Alex");

  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  const generatedUrl = new URL(generated);
  expect(generatedUrl.pathname).toBe("/s/");
  expect(generatedUrl.search).toBe("");
  expect(generatedUrl.hash).toMatch(/^#[A-Za-z0-9_-]+$/);

  const invitationPage = await context.newPage();
  await invitationPage.goto(generated);
  await expect.poll(() => invitationPage.evaluate(() => location.href)).toBe(generated);
  await invitationPage.getByRole("button", { name: "YES, I'D LOVE TO" }).click();

  const telegram = invitationPage.getByRole("link", { name: "TELL ALEX ON TELEGRAM" });
  await expect(telegram).toBeVisible();
  const href = await telegram.getAttribute("href");
  if (!href) throw new Error("Missing direct Telegram URL");
  const telegramUrl = new URL(href);
  expect(telegramUrl.origin + telegramUrl.pathname).toBe("https://t.me/alex_date");
  const draft = telegramUrl.searchParams.get("text");
  if (draft === null) throw new Error("Missing direct Telegram draft");
  expect(draft).toContain(generated);
  expect(draft.split(generated)).toHaveLength(2);

  await invitationPage.close();
});
