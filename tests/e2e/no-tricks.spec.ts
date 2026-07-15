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

test("accepts the first early mouse hover while throttling an immediate repeat", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(performance, "now", { configurable: true, value: () => 100 });
  });
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  await no.dispatchEvent("pointerenter", { pointerType: "mouse" });
  const firstTrick = await stage.getAttribute("data-last-trick");
  expect(firstTrick).not.toBeNull();

  await no.dispatchEvent("pointerenter", { pointerType: "mouse" });
  await expect(stage).toHaveAttribute("data-last-trick", firstTrick!);
});

test("keeps the growing scale and normal lift while YES is hovered", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("/?to=Jamie");
  const yes = page.locator("[data-yes]");

  await yes.hover();
  await page.waitForTimeout(250);
  const normalHover = await yes.evaluate((button) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(button).transform);
    return { scaleX: matrix.a, translateY: matrix.f };
  });
  expect(normalHover.scaleX).toBeCloseTo(1, 2);
  expect(normalHover.translateY).toBeLessThan(-1);

  await page.mouse.move(0, 0);
  await page.locator("[data-no]").dispatchEvent("click");
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", "growing-feelings");
  await page.waitForTimeout(500);
  await yes.hover();
  await page.waitForTimeout(500);

  const growingHover = await yes.evaluate((button) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(button).transform);
    return { scaleX: matrix.a, translateY: matrix.f };
  });
  expect(growingHover.scaleX).toBeGreaterThan(1.1);
  expect(growingHover.translateY).toBeLessThan(-1);
});
