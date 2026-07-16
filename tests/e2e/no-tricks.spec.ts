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

test("keeps the spotlight centered on YES after the buttons swap seats", async ({ page }) => {
  await page.addInitScript(() => {
    const samples = [0.999, 0.999, 0.2, 0.999, 0.999, 0.999, 0.999, 0, 0.999];
    let cursor = 0;
    Math.random = () => samples[cursor++] ?? 0.999;
  });
  await page.goto("/?to=Jamie");

  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  await no.dispatchEvent("click");
  await expect(stage).toHaveAttribute("data-last-trick", "seat-swap");
  await no.dispatchEvent("click");
  await expect(stage).toHaveAttribute("data-last-trick", "spotlight");
  await expect(stage).toHaveClass(/trick-swapped/);

  const focus = await stage.evaluate((element) => {
    const letter = element.querySelector<HTMLElement>("[data-letter]")!;
    const yes = element.querySelector<HTMLButtonElement>("[data-yes]")!;
    const noButton = element.querySelector<HTMLButtonElement>("[data-no]")!;
    const animation = letter
      .getAnimations({ subtree: true })
      .find((candidate) => (candidate as CSSAnimation).animationName === "spotlight");
    animation?.pause();
    if (animation) animation.currentTime = 450;

    const background = getComputedStyle(letter, "::after").backgroundImage;
    const position = background.match(/at\s+([\d.]+)(px|%)\s+([\d.]+)(px|%)/);
    if (!position) throw new Error(`Unable to read spotlight position from: ${background}`);

    const coordinate = (value: string, unit: string, size: number): number =>
      unit === "%" ? Number.parseFloat(value) * size / 100 : Number.parseFloat(value);
    const spotlight = {
      x: coordinate(position[1]!, position[2]!, letter.clientWidth),
      y: coordinate(position[3]!, position[4]!, letter.clientHeight),
    };
    const center = (button: HTMLButtonElement): { x: number; y: number } => ({
      x: button.offsetLeft + button.offsetWidth / 2,
      y: button.offsetTop + button.offsetHeight / 2,
    });
    const distance = (button: HTMLButtonElement): number => {
      const buttonCenter = center(button);
      return Math.hypot(spotlight.x - buttonCenter.x, spotlight.y - buttonCenter.y);
    };

    return {
      background,
      yesDistance: distance(yes),
      noDistance: distance(noButton),
    };
  });

  expect(focus.yesDistance).toBeLessThan(focus.noDistance);
  expect(focus.yesDistance).toBeLessThan(30);
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
    stage.classList.add("trick-swapped");
    const result = {
      before,
      after: { yes: center(yesSeat), no: center(noSeat) },
      yesOrder: getComputedStyle(yesSeat).order,
      noOrder: getComputedStyle(noSeat).order,
    };
    stage.classList.remove("trick-swapped");
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

  const no = page.locator("[data-no]");
  for (let index = 0; index < 8; index += 1) await no.dispatchEvent("click");

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
