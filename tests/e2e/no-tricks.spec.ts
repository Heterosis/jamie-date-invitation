import { expect, test } from "@playwright/test";
import {
  activateNoAndWait,
  forceTrickOrder,
  unlockRealNo,
  waitForTrickIdle,
} from "./trick-helpers";

test("hover is cosmetic and leaves all eight attempts available", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  for (let index = 0; index < 5; index += 1) {
    await no.hover();
    await page.mouse.move(0, 0);
  }

  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page);
  await expect(page.locator("[data-no-label]")).toHaveText("Okay, I'll behave…");
});

test("one mouse click accepts exactly one trick", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const stage = page.locator("[data-stage]");

  await page.locator("[data-no]").click();
  await waitForTrickIdle(page);

  await expect(stage).toHaveAttribute("data-attempts", "1");
  await expect(stage).toHaveAttribute("data-last-trick", /^[a-z-]+$/);
  await expect(page.locator("[data-success]")).toBeHidden();
});

test("busy NO activations are ignored without queueing or disabling NO", async ({ page }) => {
  await forceTrickOrder(page, ["paper-plane"]);
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  await no.dispatchEvent("click");
  await expect(stage).toHaveAttribute("data-trick-busy", "true");
  for (let index = 0; index < 5; index += 1) await no.dispatchEvent("click");

  await expect(stage).toHaveAttribute("data-attempts", "1");
  await expect(stage).toHaveAttribute("data-last-trick", "paper-plane");
  await expect(no).toBeEnabled();
  await no.focus();
  await expect(no).toBeFocused();

  await waitForTrickIdle(page);
  const settledId = await stage.getAttribute("data-last-trick");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(stage).toHaveAttribute("data-attempts", "1");
  await expect(stage).toHaveAttribute("data-last-trick", settledId!);
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
});

test("eight completed tricks are distinct and only then reveal genuine refusal", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const label = page.locator("[data-no-label]");
  const stage = page.locator("[data-stage]");
  const seen = new Set<string>();

  for (let index = 0; index < 7; index += 1) {
    await activateNoAndWait(page);
    const id = await stage.getAttribute("data-last-trick");
    expect(id).toMatch(/^[a-z-]+$/);
    seen.add(id!);
    await expect(label).not.toContainText("Okay, I'll behave");
  }

  await no.click();
  await expect(stage).toHaveAttribute("data-trick-busy", "true");
  await expect(label).not.toContainText("Okay, I'll behave");
  await waitForTrickIdle(page);
  const eighthId = await stage.getAttribute("data-last-trick");
  expect(eighthId).toMatch(/^[a-z-]+$/);
  seen.add(eighthId!);

  expect(seen.size).toBe(8);
  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(label).toHaveText("Okay, I'll behave…");
});

test("the genuine-refusal click draws no ninth trick", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const stage = page.locator("[data-stage]");
  await unlockRealNo(page);
  const eighthTrick = await stage.getAttribute("data-last-trick");

  await page.locator("[data-no]").click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(stage).toHaveAttribute("data-last-trick", eighthTrick!);
});

test("keeps persistent Growing scale while cosmetic face hover still lifts", async ({ page }) => {
  await forceTrickOrder(page, ["growing-feelings"]);
  await page.goto("/?to=Jamie");
  const stage = page.locator("[data-stage]");
  const yes = page.locator("[data-yes]");

  await activateNoAndWait(page);
  await expect(stage).toHaveAttribute("data-last-trick", "growing-feelings");
  await yes.hover();
  await expect.poll(async () => yes.evaluate((button) => {
    const value = getComputedStyle(
      button.querySelector<HTMLElement>("[data-yes-face]")!,
    ).translate;
    return (value.match(/-?\d*\.?\d+/g)?.map(Number) ?? [0, 0])[1] ?? 0;
  })).toBeCloseTo(-2, 1);

  const growing = await stage.evaluate((element) => {
    const yesButton = element.querySelector<HTMLElement>("[data-yes]")!;
    const noButton = element.querySelector<HTMLElement>("[data-no]")!;
    const yesFace = element.querySelector<HTMLElement>("[data-yes-face]")!;
    const noFace = element.querySelector<HTMLElement>("[data-no-face]")!;
    const matrix = (target: HTMLElement): DOMMatrixReadOnly => {
      const transform = getComputedStyle(target).transform;
      return transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
    };
    const translateY = (target: HTMLElement): number => {
      const value = getComputedStyle(target).translate;
      const coordinates = value.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      return coordinates.length > 1 ? coordinates[1]! : 0;
    };
    return {
      yesButtonScaleX: matrix(yesButton).a,
      noButtonScaleX: matrix(noButton).a,
      yesFaceScaleX: matrix(yesFace).a,
      noFaceScaleX: matrix(noFace).a,
      yesFaceTranslateY: translateY(yesFace),
      noFaceTranslateY: translateY(noFace),
    };
  });

  expect(growing.yesButtonScaleX).toBeCloseTo(1, 4);
  expect(growing.noButtonScaleX).toBeCloseTo(1, 4);
  expect(growing.yesFaceScaleX).toBeGreaterThan(1);
  expect(growing.noFaceScaleX).toBeLessThan(1);
  expect(growing.yesFaceTranslateY).toBeCloseTo(-2, 1);
  expect(growing.noFaceTranslateY).toBeCloseTo(0, 4);
});

test("keeps the spotlight centered on YES after the buttons swap seats", async ({ page }) => {
  await forceTrickOrder(page, ["seat-swap", "spotlight"]);
  await page.goto("/?to=Jamie");

  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  await activateNoAndWait(page);
  await expect(stage).toHaveAttribute("data-last-trick", "seat-swap");
  await expect(stage).toHaveAttribute("data-swapped", "");

  await no.click();
  await expect(stage).toHaveAttribute("data-last-trick", "spotlight");
  const overlay = page.locator(".trick-spotlight-overlay");
  await expect(overlay).toBeAttached();

  const focus = await overlay.evaluate((spotlight) => {
    const letter = spotlight.closest<HTMLElement>("[data-letter]")!;
    const yes = letter.querySelector<HTMLButtonElement>("[data-yes]")!;
    const no = letter.querySelector<HTMLButtonElement>("[data-no]")!;
    const letterRect = letter.getBoundingClientRect();
    const yesRect = yes.getBoundingClientRect();
    const noRect = no.getBoundingClientRect();
    const expected = {
      x: yesRect.left - letterRect.left + yesRect.width / 2,
      y: yesRect.top - letterRect.top + yesRect.height / 2,
    };
    const x = Number.parseFloat(getComputedStyle(spotlight).getPropertyValue("--spotlight-x"));
    const y = Number.parseFloat(getComputedStyle(spotlight).getPropertyValue("--spotlight-y"));
    return {
      x,
      y,
      expected,
      yesDistance: Math.hypot(x - expected.x, y - expected.y),
      noDistance: Math.hypot(
        x - (noRect.left - letterRect.left + noRect.width / 2),
        y - (noRect.top - letterRect.top + noRect.height / 2),
      ),
    };
  });

  expect(focus.x).toBeCloseTo(focus.expected.x, 1);
  expect(focus.y).toBeCloseTo(focus.expected.y, 1);
  expect(focus.yesDistance).toBeLessThan(30);
  expect(focus.yesDistance).toBeLessThan(focus.noDistance);
  await waitForTrickIdle(page);
  await expect(overlay).toHaveCount(0);
  await expect(stage).toHaveAttribute("data-swapped", "");
});
