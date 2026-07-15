import { expect, test } from "@playwright/test";

test("supports keyboard YES and moves focus to the result", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "YES, I'D LOVE TO" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeFocused();
});

test("announces keyboard NO changes through a polite status region", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const status = page.getByRole("status");
  const no = page.locator("[data-no]");

  await no.focus();
  await page.keyboard.press("Enter");
  await expect(status).not.toBeEmpty();
  await expect(status).toHaveAttribute("aria-live", "polite");

  for (let index = 0; index < 7; index += 1) await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeFocused();
});

test("marks and visually suppresses motion when reduced motion is requested", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?to=Jamie");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  const duration = await page.locator("[data-letter]").evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);

  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");
  await no.dispatchEvent("click");
  await expect(stage).toHaveAttribute("data-last-trick", "runaway-rsvp");
  await expect(no).not.toHaveClass(/trick-runaway/);
  const staticTransform = await no.evaluate((button) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(button).transform);
    return { x: matrix.e, y: matrix.f };
  });
  expect(staticTransform.x).toBeCloseTo(14, 1);
  expect(staticTransform.y).toBeCloseTo(-4, 1);

  await page.locator("[data-yes]").dispatchEvent("click");
  await expect(stage).not.toHaveAttribute("data-last-trick");
});

test("uses one tap to trigger one NO trick on the mobile project", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Touch behavior is exercised by the mobile project");
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  await no.tap();
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", /.+/);
  await expect(page.locator("[data-success]")).toBeHidden();

  for (let index = 0; index < 7; index += 1) await no.dispatchEvent("click");
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});
