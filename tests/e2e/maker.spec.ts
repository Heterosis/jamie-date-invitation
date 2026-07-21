import { expect, test } from "@playwright/test";
import { decodeShortInvitationHash } from "../../src/short-url/short-url";

function decodeGeneratedUrl(generated: string) {
  return decodeShortInvitationHash(new URL(generated).hash);
}

function expectOpaqueShortUrl(generated: string, pathname = "/s/"): URL {
  const url = new URL(generated);
  expect(url.pathname).toBe(pathname);
  expect(url.search).toBe("");
  expect(url.hash).toMatch(/^#[A-Za-z0-9_-]+$/);
  expect(generated).not.toContain("make=");
  return url;
}

async function fillSchedule(page: import("@playwright/test").Page): Promise<void> {
  await page.getByLabel("Date").fill("2026-08-08");
  await page.getByLabel("Time").fill("19:30");
}

test("builds a ready-to-send URL and matching live preview", async ({ page }) => {
  await page.goto("/?make=1");
  await page.getByLabel("From").fill("Alex");
  await page.getByLabel("Date").fill("2026-08-08");
  await page.getByLabel("Time").fill("19:30");
  await page.getByLabel("Telegram username").fill("alex_date");
  await page.getByLabel("Telegram display name").fill("Alex");
  await expect(page.getByText("Ready to send ♥")).toBeVisible();

  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generated);
  expect(generated).not.toContain("Alex");
  expect(generated).not.toContain("2026-08-08");
  expect(decodeGeneratedUrl(generated)).toMatchObject({
    from: "Alex",
    date: "2026-08-08",
    time: "19:30",
    telegram: "alex_date",
    notifyName: "Alex",
  });
  await expect(page.locator('iframe[title="Invitation preview"]')).toHaveAttribute("src", generated);

  const preview = page.frameLocator('iframe[title="Invitation preview"]');
  await expect(preview.getByRole("heading", {
    name: "Jamie, will you go on a date with me?",
  })).toBeVisible();
  await expect(preview.locator("[data-signature]")).toHaveText("from Alex");
});

test("keeps incomplete values only in the internal legacy preview", async ({ page }) => {
  await page.goto("/?make=1");

  const generated = page.getByLabel("Generated invitation URL");
  const copy = page.getByRole("button", { name: "Copy invitation link" });
  await expect(generated).toHaveValue("");
  await expect(copy).toBeDisabled();

  await page.getByLabel("From").fill("Draft Alex");
  await page.getByLabel("Time").fill("20:45");

  await expect(generated).toHaveValue("");
  await expect(copy).toBeDisabled();
  const previewValue = await page.locator('iframe[title="Invitation preview"]').getAttribute("src");
  if (!previewValue) throw new Error("Missing internal maker preview URL");
  const previewUrl = new URL(previewValue);
  expect(previewUrl.pathname).toBe("/");
  expect(previewUrl.hash).toBe("");
  expect(previewUrl.searchParams.has("make")).toBe(false);
  expect(previewUrl.searchParams.get("from")).toBe("Draft Alex");
  expect(previewUrl.searchParams.get("time")).toBe("20:45");
  expect(previewUrl.searchParams.has("date")).toBe(false);
});

test("does not persist maker values in browser storage", async ({ page }) => {
  await page.goto("/?make=1");
  await page.getByLabel("From").fill("Alex");
  expect(await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }))).toEqual({ local: 0, session: 0 });
});

test("offers a native IANA time-zone selector that updates the link and preview", async ({ page }) => {
  await page.goto("/?make=1");
  await fillSchedule(page);

  const timeZone = page.getByLabel("IANA zone");
  await expect(timeZone).toHaveJSProperty("tagName", "SELECT");
  const options = await timeZone.locator("option").evaluateAll((elements) =>
    elements.map((element) => (element as HTMLOptionElement).value),
  );
  expect(options.length).toBeGreaterThan(100);
  expect(options).toEqual(expect.arrayContaining([
    "Asia/Singapore",
    "America/New_York",
    "Europe/London",
  ]));

  const browserTimeZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore",
  );
  await expect(timeZone).toHaveValue(browserTimeZone);

  await timeZone.selectOption("America/New_York");
  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generated);
  expect(decodeGeneratedUrl(generated).tz).toBe("America/New_York");
  await expect(page.locator('iframe[title="Invitation preview"]')).toHaveAttribute("src", generated);
  await expect.poll(() => {
    const preview = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
    return preview && preview.url().includes("#")
      ? decodeShortInvitationHash(new URL(preview.url()).hash).tz
      : null;
  }).toBe("America/New_York");
});

test("keeps a substantial deterministic IANA fallback list", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/?make=1&tz=Antarctica%2FTroll");

  const timeZone = page.getByLabel("IANA zone");
  await expect(timeZone).toHaveJSProperty("tagName", "SELECT");
  const options = await timeZone.locator("option").evaluateAll((elements) =>
    elements.map((element) => (element as HTMLOptionElement).value),
  );
  expect(options.length).toBeGreaterThanOrEqual(30);
  expect(options).toEqual(expect.arrayContaining([
    "Asia/Singapore",
    "America/New_York",
    "Europe/London",
    "Pacific/Auckland",
    "Antarctica/Troll",
  ]));
});

test("copies the generated link only when the form is ready", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  await page.goto("/?make=1");
  const copy = page.getByRole("button", { name: "Copy invitation link" });
  await expect(copy).toBeDisabled();
  await page.getByLabel("Date").fill("2026-08-08");
  await page.getByLabel("Time").fill("19:30");
  await expect(copy).toBeEnabled();
  await copy.click();
  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generated);
  await expect(page.locator('iframe[title="Invitation preview"]')).toHaveAttribute("src", generated);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(generated);
});

test("passes the exact generated preview URL to native sharing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { sharedInvitation?: ShareData }).sharedInvitation = data;
      },
    });
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generated);
  await expect(page.locator('iframe[title="Invitation preview"]')).toHaveAttribute("src", generated);
  await page.getByRole("button", { name: "Share link" }).click();

  const sharedUrl = await page.evaluate(
    () => (window as Window & { sharedInvitation?: ShareData }).sharedInvitation?.url,
  );
  expect(sharedUrl).toBe(generated);
});

test("reset returns to an incomplete private preview", async ({ page }) => {
  await page.goto("/?make=1");
  await page.getByLabel("From").fill("Alex");
  await fillSchedule(page);
  await expect(page.getByLabel("Generated invitation URL")).not.toHaveValue("");

  await page.getByRole("button", { name: "Reset" }).click();

  await expect(page.getByLabel("To", { exact: true })).toHaveValue("Jamie");
  await expect(page.getByLabel("From")).toHaveValue("");
  await expect(page.getByLabel("Date")).toHaveValue("");
  await expect(page.getByLabel("Time")).toHaveValue("");
  await expect(page.getByLabel("Generated invitation URL")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Copy invitation link" })).toBeDisabled();

  const previewValue = await page.locator('iframe[title="Invitation preview"]').getAttribute("src");
  if (!previewValue) throw new Error("Missing internal maker preview URL");
  expect(new URL(previewValue).pathname).toBe("/");
  expect(new URL(previewValue).search).not.toBe("");
});

test("normalizes blank duration and time zone before copying", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  const browserTimeZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore",
  );
  const duration = page.getByLabel("Duration in minutes");
  const timeZone = page.getByLabel("IANA zone");
  const copy = page.getByRole("button", { name: "Copy invitation link" });
  await expect(timeZone).toHaveValue(browserTimeZone);

  await duration.fill("");
  await timeZone.selectOption("");
  await expect(copy).toBeEnabled();

  const generatedBeforeBlur = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generatedBeforeBlur);
  expect(decodeGeneratedUrl(generatedBeforeBlur)).toMatchObject({
    duration: 120,
    tz: browserTimeZone,
  });
  await expect(page.locator('iframe[title="Invitation preview"]'))
    .toHaveAttribute("src", generatedBeforeBlur);

  await copy.click();
  await expect(duration).toHaveValue("120");
  await expect(timeZone).toHaveValue(browserTimeZone);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(generatedBeforeBlur);
});

test("rejects invalid durations and accepts integers inside the domain bounds", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => undefined,
    });
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  const duration = page.getByLabel("Duration in minutes");
  const copy = page.getByRole("button", { name: "Copy invitation link" });
  const share = page.getByRole("button", { name: "Share link" });
  await expect(duration).toHaveAttribute("step", "1");

  for (const invalid of ["14", "721", "15.5"]) {
    await duration.fill(invalid);
    await expect(page.getByText("Choose a whole duration from 15 to 720 minutes.")).toBeVisible();
    await expect(page.getByLabel("Generated invitation URL")).toHaveValue("");
    await expect(copy).toBeDisabled();
    await expect(share).toBeDisabled();
    const previewValue = await page.locator('iframe[title="Invitation preview"]').getAttribute("src");
    if (!previewValue) throw new Error("Missing internal maker preview URL");
    expect(new URL(previewValue).searchParams.get("duration")).toBe(invalid);
  }

  for (const valid of ["15", "121", "720"]) {
    await duration.fill(valid);
    await expect(copy).toBeEnabled();
    await expect(share).toBeEnabled();
    expect(decodeGeneratedUrl(
      await page.getByLabel("Generated invitation URL").inputValue(),
    ).duration).toBe(Number(valid));
  }
});

test("rejects an explicit invalid nonempty time zone", async ({ page }) => {
  await page.goto("/?make=1");
  await fillSchedule(page);
  await page.getByLabel("IANA zone").evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.add(new Option("Mars/Olympus", "Mars/Olympus"));
    select.value = "Mars/Olympus";
    select.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect(page.getByText("Choose a valid IANA time zone.")).toBeVisible();
  await expect(page.getByLabel("Generated invitation URL")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Copy invitation link" })).toBeDisabled();
  const previewValue = await page.locator('iframe[title="Invitation preview"]').getAttribute("src");
  if (!previewValue) throw new Error("Missing internal maker preview URL");
  expect(new URL(previewValue).searchParams.get("tz")).toBe("Mars/Olympus");
});

test.describe("browser time-zone default", () => {
  test.use({ timezoneId: "America/New_York" });

  test("validates DST gaps after the blank zone resolves to the browser zone", async ({ page }) => {
    await page.goto("/?make=1");
    await page.getByLabel("Date").fill("2026-03-08");
    await page.getByLabel("Time").fill("02:30");
    const timeZone = page.getByLabel("IANA zone");
    await expect(timeZone).toHaveValue("America/New_York");
    await timeZone.selectOption("");

    await expect(page.getByText(
      "That local date and time is ambiguous or does not exist in this time zone.",
    )).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy invitation link" })).toBeDisabled();

    await expect(page.getByLabel("Generated invitation URL")).toHaveValue("");
    const previewValue = await page.locator('iframe[title="Invitation preview"]').getAttribute("src");
    if (!previewValue) throw new Error("Missing internal maker preview URL");
    const previewUrl = new URL(previewValue);
    expect(previewUrl.searchParams.get("tz")).toBe("America/New_York");
    expect(previewUrl.searchParams.get("date")).toBe("2026-03-08");
    expect(previewUrl.searchParams.get("time")).toBe("02:30");

    await timeZone.focus();
    await timeZone.blur();
    await expect(timeZone).toHaveValue("America/New_York");
  });
});

test("normalizes surrounding time-zone whitespace for the URL and preview", async ({ page }) => {
  await page.goto("/?make=1");
  await fillSchedule(page);
  await page.getByLabel("IANA zone").evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.add(new Option("Asia/Singapore with spaces", " Asia/Singapore "));
    select.value = " Asia/Singapore ";
    select.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByText("Ready to send ♥")).toBeVisible();

  const generated = await page.getByLabel("Generated invitation URL").inputValue();
  expectOpaqueShortUrl(generated);
  expect(decodeGeneratedUrl(generated).tz).toBe("Asia/Singapore");
  await expect(page.locator('iframe[title="Invitation preview"]')).toHaveAttribute("src", generated);
  const preview = page.frameLocator('iframe[title="Invitation preview"]');
  await expect(preview.getByText("Saturday, August 8, 2026")).toBeVisible();
});

test("reports clipboard failure when fallback copy returns false", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("clipboard denied"); } },
    });
    document.execCommand = () => false;
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  await page.getByRole("button", { name: "Copy invitation link" }).click();
  await expect(page.getByText("Copy failed — select the link and copy it manually.")).toBeVisible();
  const selection = await page.getByLabel("Generated invitation URL").evaluate((element) => {
    const field = element as HTMLInputElement;
    return { start: field.selectionStart, end: field.selectionEnd, length: field.value.length };
  });
  expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length });
});

test("reports clipboard failure when fallback copy throws", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = () => { throw new Error("legacy copy unavailable"); };
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  await page.getByRole("button", { name: "Copy invitation link" }).click();
  await expect(page.getByText("Copy failed — select the link and copy it manually.")).toBeVisible();
});

test("reports non-cancel share failures without an unhandled rejection", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { throw new Error("share unavailable"); },
    });
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Sharing failed — copy the invitation link instead.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps a cancelled native share quiet", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { throw new DOMException("cancelled", "AbortError"); },
    });
  });
  await page.goto("/?make=1");
  await fillSchedule(page);

  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Ready to send ♥")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
