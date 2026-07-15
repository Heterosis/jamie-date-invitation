import { expect, test } from "@playwright/test";

async function unlockRealNo(page: import("@playwright/test").Page): Promise<void> {
  const no = page.locator("[data-no]");
  for (let index = 0; index < 8; index += 1) await no.dispatchEvent("click");
}

test("YES celebrates without opening external pages automatically", async ({ page, context }) => {
  await page.goto("/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&telegram=alex_date&notifyName=Alex");
  const pagesBefore = context.pages().length;
  await page.getByRole("button", { name: "YES, I'D LOVE TO" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  expect(context.pages()).toHaveLength(pagesBefore);

  const calendar = page.getByRole("link", { name: "+ GOOGLE CALENDAR" });
  expect(new URL((await calendar.getAttribute("href"))!).hostname).toBe("calendar.google.com");
  const telegram = page.getByRole("link", { name: "TELL ALEX ON TELEGRAM" });
  expect(new URL((await telegram.getAttribute("href"))!).pathname).toBe("/alex_date");
});

test("consumes the next click after a pointer-triggered trick", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await page.locator("[data-no]").hover();
  await page.locator("[data-yes]").dispatchEvent("click");
  await expect(page.locator("[data-success]")).toBeHidden();
  await page.waitForTimeout(700);
  await page.locator("[data-yes]").dispatchEvent("click");
  await expect(page.locator("[data-success]")).toBeVisible();
});

test("accepts a genuine refusal only after the dramatic confirmation", async ({ page }) => {
  await page.goto("/?to=Jamie&telegram=alex_date");
  await unlockRealNo(page);
  await page.getByRole("button", { name: "Okay, I'll behave…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).click();
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeVisible();
  await expect(page.locator("[data-calendar]")).toBeHidden();
  await expect(page.locator("[data-telegram]")).toBeHidden();
});

test("Actually, yes returns from confirmation to celebration", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await unlockRealNo(page);
  await page.getByRole("button", { name: "Okay, I'll behave…" }).click();
  await page.getByRole("button", { name: "Actually, yes" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
});

test("reopens refusal confirmation after Escape and still accepts genuine refusal", async ({ page }) => {
  await page.goto("/?to=Jamie&telegram=alex_date");
  await unlockRealNo(page);
  const genuineNo = page.getByRole("button", { name: "Okay, I'll behave…" });
  const dialog = page.getByRole("dialog");
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-success]")).toBeHidden();
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).click();
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeVisible();
});

test("reopens refusal confirmation after Escape and still accepts Actually yes", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await unlockRealNo(page);
  const genuineNo = page.getByRole("button", { name: "Okay, I'll behave…" });
  const dialog = page.getByRole("dialog");
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-success]")).toBeHidden();
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Actually, yes" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
});
