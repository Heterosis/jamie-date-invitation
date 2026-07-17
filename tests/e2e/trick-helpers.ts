import { expect, type Page } from "@playwright/test";

export async function waitForTrickIdle(page: Page): Promise<void> {
  const stage = page.locator("[data-stage]");
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
  await expect(stage).toHaveAttribute("aria-busy", "false");
}

export async function activateNoAndWait(
  page: Page,
  mode: "mouse" | "tap" | "enter" | "space" = "mouse",
): Promise<void> {
  const no = page.locator("[data-no]");
  if (mode === "mouse") await no.click();
  if (mode === "tap") await no.tap();
  if (mode === "enter") {
    await no.focus();
    await page.keyboard.press("Enter");
  }
  if (mode === "space") {
    await no.focus();
    await page.keyboard.press("Space");
  }
  await waitForTrickIdle(page);
}

export async function unlockRealNo(page: Page): Promise<void> {
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page);
}
