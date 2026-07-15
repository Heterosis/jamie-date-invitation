import { expect, test } from "@playwright/test";

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
  const url = new URL(generated);
  expect(url.searchParams.get("from")).toBe("Alex");
  expect(url.searchParams.get("date")).toBe("2026-08-08");
  expect(url.searchParams.has("make")).toBe(false);

  const preview = page.frameLocator('iframe[title="Invitation preview"]');
  await expect(preview.getByRole("heading", {
    name: "Jamie, will you go on a date with me?",
  })).toBeVisible();
});

test("does not persist maker values in browser storage", async ({ page }) => {
  await page.goto("/?make=1");
  await page.getByLabel("From").fill("Alex");
  expect(await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }))).toEqual({ local: 0, session: 0 });
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
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(generated);
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

  for (const invalid of ["", "14", "721", "15.5"]) {
    await duration.fill(invalid);
    await expect(page.getByText("Choose a whole duration from 15 to 720 minutes.")).toBeVisible();
    await expect(copy).toBeDisabled();
    await expect(share).toBeDisabled();
  }

  for (const valid of ["15", "121", "720"]) {
    await duration.fill(valid);
    await expect(copy).toBeEnabled();
    await expect(share).toBeEnabled();
  }
});

test("normalizes surrounding time-zone whitespace for the URL and preview", async ({ page }) => {
  await page.goto("/?make=1");
  await fillSchedule(page);
  await page.getByLabel("IANA zone").fill(" Asia/Singapore ");
  await expect(page.getByText("Ready to send ♥")).toBeVisible();

  const generated = new URL(await page.getByLabel("Generated invitation URL").inputValue());
  expect(generated.searchParams.get("tz")).toBe("Asia/Singapore");
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
