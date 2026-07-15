import { expect, test } from "@playwright/test";

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
