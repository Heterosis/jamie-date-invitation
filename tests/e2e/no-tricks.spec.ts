import { expect, test } from "@playwright/test";
import { activateNoAndWait, unlockRealNo, waitForTrickIdle } from "./trick-helpers";

test("dispenses eight unique tricks before revealing real refusal", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");
  const seen: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await activateNoAndWait(page);
    const id = await stage.getAttribute("data-last-trick");
    expect(id).not.toBeNull();
    seen.push(id!);
  }
  expect(new Set(seen).size).toBe(8);
  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.locator("[data-success]")).toBeHidden();

  const eighthTrick = await stage.getAttribute("data-last-trick");
  await no.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(stage).toHaveAttribute("data-last-trick", eighthTrick!);
  await expect(stage).toHaveAttribute("data-attempts", "8");
});

test("keeps mouse hover cosmetic and does not start a trick transaction", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  await no.hover();
  await page.waitForTimeout(250);
  const hoverState = await no.evaluate((button) => {
    const face = button.querySelector<HTMLElement>("[data-no-face]")!;
    const values = getComputedStyle(face).translate.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    return {
      faceTranslateY: values.length > 1 ? values[1]! : 0,
      buttonTransform: getComputedStyle(button).transform,
    };
  });

  expect(hoverState.faceTranslateY).toBeCloseTo(-2, 1);
  expect(hoverState.buttonTransform).toBe("none");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
  await expect(stage).toHaveAttribute("aria-busy", "false");
});

test("lifts the YES face without transforming its semantic button", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const yes = page.locator("[data-yes]");
  const stage = page.locator("[data-stage]");

  const before = await yes.evaluate((button) => {
    const face = button.querySelector<HTMLElement>("[data-yes-face]")!;
    const buttonStyle = getComputedStyle(button);
    const buttonMatrix = buttonStyle.transform === "none"
      ? new DOMMatrixReadOnly()
      : new DOMMatrixReadOnly(buttonStyle.transform);
    const faceTranslate = getComputedStyle(face).translate;
    const coordinates = faceTranslate.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const stage = button.closest<HTMLElement>("[data-stage]")!;
    return {
      buttonScaleX: buttonMatrix.a,
      buttonTranslateY: buttonMatrix.f,
      faceTranslateY: coordinates.length > 1 ? coordinates[1]! : 0,
      lastTrick: stage.getAttribute("data-last-trick"),
      attempts: stage.getAttribute("data-attempts"),
    };
  });
  await yes.hover();
  await page.waitForTimeout(250);
  const hovered = await yes.evaluate((button) => {
    const face = button.querySelector<HTMLElement>("[data-yes-face]")!;
    const buttonStyle = getComputedStyle(button);
    const buttonMatrix = buttonStyle.transform === "none"
      ? new DOMMatrixReadOnly()
      : new DOMMatrixReadOnly(buttonStyle.transform);
    const faceTranslate = getComputedStyle(face).translate;
    const coordinates = faceTranslate.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const stage = button.closest<HTMLElement>("[data-stage]")!;
    return {
      buttonScaleX: buttonMatrix.a,
      buttonTranslateY: buttonMatrix.f,
      faceTranslateY: coordinates.length > 1 ? coordinates[1]! : 0,
      lastTrick: stage.getAttribute("data-last-trick"),
      attempts: stage.getAttribute("data-attempts"),
    };
  });

  expect(before.buttonScaleX).toBeCloseTo(1, 4);
  expect(before.buttonTranslateY).toBeCloseTo(0, 4);
  expect(before.faceTranslateY).toBeCloseTo(0, 4);
  expect(hovered.buttonScaleX).toBeCloseTo(1, 4);
  expect(hovered.buttonTranslateY).toBeCloseTo(0, 4);
  expect(hovered.faceTranslateY).toBeCloseTo(-2, 1);
  expect(hovered.lastTrick).toBe(before.lastTrick);
  expect(hovered.attempts).toBe(before.attempts);
  await expect(stage).not.toHaveAttribute("data-last-trick");
});

test("paints the disguise emoji from renderer copy only", async ({ page }) => {
  await page.goto("/?to=Jamie");

  const disguise = await page.locator("[data-stage]").evaluate((stage) => {
    const costume = stage.querySelector<HTMLElement>("[data-no-costume]")!;
    stage.setAttribute("data-disguised", "");
    costume.hidden = false;
    costume.textContent = "🥸";
    const result = {
      textContent: costume.textContent,
      display: getComputedStyle(costume).display,
      pseudoContent: getComputedStyle(costume, "::before").content,
    };
    costume.textContent = "";
    costume.hidden = true;
    stage.removeAttribute("data-disguised");
    return result;
  });

  expect(disguise.textContent).toBe("🥸");
  expect(disguise.display).not.toBe("none");
  expect(["none", "", "\"\"", "''"]).toContain(disguise.pseudoContent);
});

test("keeps persistent Growing scale while cosmetic face hover still lifts", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto("/?to=Jamie");
  const stage = page.locator("[data-stage]");
  const yes = page.locator("[data-yes]");

  await activateNoAndWait(page);
  await activateNoAndWait(page);
  await expect(stage).toHaveAttribute("data-last-trick", "growing-feelings");
  await yes.hover();
  await page.waitForTimeout(250);

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
  await page.addInitScript(() => {
    const samples = [0.999, 0.999, 0.2, 0.999, 0.999, 0.999, 0.999, 0, 0.999];
    let cursor = 0;
    Math.random = () => samples[cursor++] ?? 0.999;
  });
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
    const letterRect = letter.getBoundingClientRect();
    const yesRect = yes.getBoundingClientRect();
    const expected = {
      x: yesRect.left - letterRect.left + yesRect.width / 2,
      y: yesRect.top - letterRect.top + yesRect.height / 2,
    };
    return {
      x: Number.parseFloat(getComputedStyle(spotlight).getPropertyValue("--spotlight-x")),
      y: Number.parseFloat(getComputedStyle(spotlight).getPropertyValue("--spotlight-y")),
      expected,
    };
  });

  expect(focus.x).toBeCloseTo(focus.expected.x, 1);
  expect(focus.y).toBeCloseTo(focus.expected.y, 1);
  await waitForTrickIdle(page);
  await expect(overlay).toHaveCount(0);
  await expect(stage).toHaveAttribute("data-swapped", "");
});

test("uses stable semantic buttons inside dedicated visual layers", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("/?to=Jamie");

  const result = await page.locator("[data-actions]").evaluate((actions) => {
    const yes = actions.querySelector<HTMLButtonElement>("[data-yes]")!;
    const no = actions.querySelector<HTMLButtonElement>("[data-no]")!;
    Reflect.set(actions, "__stableChoiceNodes", [yes, no]);
    const noRect = no.getBoundingClientRect();
    return {
      yesLayers: Boolean(
        yes.closest("[data-yes-motion]")?.closest("[data-yes-seat]")
        && yes.querySelector("[data-yes-face]"),
      ),
      noLayers: Boolean(
        no.closest("[data-no-motion]")?.closest("[data-no-seat]")
        && no.querySelector("[data-no-face]")
        && no.querySelector("[data-no-label]")
        && no.querySelector("[data-no-costume]"),
      ),
      noWidth: noRect.width,
      noHeight: noRect.height,
    };
  });

  expect(result.yesLayers).toBe(true);
  expect(result.noLayers).toBe(true);
  expect(result.noWidth).toBeGreaterThanOrEqual(44);
  expect(result.noHeight).toBeGreaterThanOrEqual(44);
  expect(await page.locator("[data-stage]").getByRole("status").count()).toBe(0);

  const seatSwap = await page.locator("[data-stage]").evaluate((stage) => {
    const yesSeat = stage.querySelector<HTMLElement>("[data-yes-seat]")!;
    const noSeat = stage.querySelector<HTMLElement>("[data-no-seat]")!;
    const center = (seat: HTMLElement): { centerX: number; centerY: number; height: number } => {
      const rect = seat.getBoundingClientRect();
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        height: rect.height,
      };
    };
    const before = { yes: center(yesSeat), no: center(noSeat) };
    stage.setAttribute("data-swapped", "");
    const result = {
      before,
      after: { yes: center(yesSeat), no: center(noSeat) },
      yesOrder: getComputedStyle(yesSeat).order,
      noOrder: getComputedStyle(noSeat).order,
    };
    stage.removeAttribute("data-swapped");
    return result;
  });

  const visuallyPrecedes = (
    first: { centerX: number; centerY: number; height: number },
    second: { centerX: number; centerY: number; height: number },
  ): boolean => {
    const sameRowTolerance = Math.min(first.height, second.height) * 0.25;
    return Math.abs(first.centerY - second.centerY) <= sameRowTolerance
      ? first.centerX < second.centerX
      : first.centerY < second.centerY;
  };

  expect.soft(seatSwap.yesOrder).toBe("2");
  expect.soft(seatSwap.noOrder).toBe("1");
  expect.soft(visuallyPrecedes(seatSwap.before.yes, seatSwap.before.no)).toBe(true);
  expect.soft(visuallyPrecedes(seatSwap.after.no, seatSwap.after.yes)).toBe(true);

  await unlockRealNo(page);

  const afterTricks = await page.locator("[data-actions]").evaluate((actions) => {
    const yes = actions.querySelector<HTMLButtonElement>("[data-yes]")!;
    const noButton = actions.querySelector<HTMLButtonElement>("[data-no]")!;
    const originalNodes = Reflect.get(actions, "__stableChoiceNodes") as Element[];
    return {
      sameYesButton: yes === originalNodes[0],
      sameNoButton: noButton === originalNodes[1],
      yesLayers: Boolean(
        yes.closest("[data-yes-motion]")?.closest("[data-yes-seat]")
        && yes.querySelector("[data-yes-face]"),
      ),
      noLayers: Boolean(
        noButton.closest("[data-no-motion]")?.closest("[data-no-seat]")
        && noButton.querySelector("[data-no-face]")
        && noButton.querySelector("[data-no-label]")
        && noButton.querySelector("[data-no-costume]"),
      ),
    };
  });

  expect(afterTricks.sameYesButton).toBe(true);
  expect(afterTricks.sameNoButton).toBe(true);
  expect(afterTricks.yesLayers).toBe(true);
  expect(afterTricks.noLayers).toBe(true);
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
});
