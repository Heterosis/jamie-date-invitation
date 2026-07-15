import { expect, test } from "@playwright/test";

test("dispenses eight unique tricks before revealing real refusal", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const seen: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await no.dispatchEvent("click");
    const id = await page.locator("[data-stage]").getAttribute("data-last-trick");
    expect(id).not.toBeNull();
    seen.push(id!);
  }
  expect(new Set(seen).size).toBe(8);
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.locator("[data-success]")).toBeHidden();
});
