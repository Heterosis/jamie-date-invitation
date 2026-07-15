import { expect, test } from "@playwright/test";

test("loads the invitation shell", async ({ page }) => {
  await page.goto("/?to=Jamie");
  await expect(page.getByRole("heading", { name: /Jamie, will you go on a date with me\?/i })).toBeVisible();
});
