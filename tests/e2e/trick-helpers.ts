import { expect, type Page } from "@playwright/test";
import { TRICK_IDS, type TrickId } from "../../src/domain/trick-deck";

export async function forceTrickOrder(
  page: Page,
  desired: readonly TrickId[],
): Promise<void> {
  if (new Set(desired).size !== desired.length) {
    throw new Error(`Trick order contains duplicates: ${desired.join(", ")}`);
  }
  if (desired.some((id) => !TRICK_IDS.includes(id))) {
    throw new Error(`Trick order contains an unknown ID: ${desired.join(", ")}`);
  }

  const source = [...TRICK_IDS];
  const fullOrder = [...desired, ...source.filter((id) => !desired.includes(id))];
  const samples: number[] = [];

  for (let index = source.length - 1; index > 0; index -= 1) {
    const swapIndex = source.indexOf(fullOrder[index]!, 0);
    if (swapIndex > index || swapIndex < 0) throw new Error("Invalid target shuffle");
    samples.push((swapIndex + 0.5) / (index + 1));
    [source[index], source[swapIndex]] = [source[swapIndex]!, source[index]!];
  }

  await page.addInitScript((values) => {
    let cursor = 0;
    Math.random = () => values[cursor++] ?? 0.5;
  }, samples);
}

export function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

export async function buttonIdentityToken(
  page: Page,
  choice: "yes" | "no",
): Promise<string> {
  return page.locator(`[data-${choice}]`).evaluate((button) => {
    const key = "__playwrightChoiceIdentity";
    const existing = Reflect.get(button, key);
    if (typeof existing === "string") return existing;
    const token = crypto.randomUUID();
    Reflect.set(button, key, token);
    return token;
  });
}

export async function assertNoTrickResidue(page: Page): Promise<void> {
  const residue = await page.locator("[data-stage]").evaluate((stage) => {
    const yesFace = stage.querySelector<HTMLElement>("[data-yes-face]")!;
    const noFace = stage.querySelector<HTMLElement>("[data-no-face]")!;
    const noSeat = stage.querySelector<HTMLElement>("[data-no-seat]")!;
    const noCostume = stage.querySelector<HTMLElement>("[data-no-costume]")!;
    const allowedCssAnimations = new Set([
      "letter-arrives",
      "celebrate-letter",
      "confetti",
    ]);
    const activeAnimations = stage.getAnimations({ subtree: true }).flatMap((animation) => {
      if (animation.playState === "finished" || animation.playState === "idle") return [];
      if (
        animation instanceof CSSAnimation
        && allowedCssAnimations.has(animation.animationName)
      ) return [];
      const target = animation.effect instanceof KeyframeEffect
        ? animation.effect.target
        : null;
      return [{
        playState: animation.playState,
        target: target instanceof HTMLElement
          ? target.dataset.trickArtifact
            ? `${target.tagName.toLowerCase()}[data-trick-artifact]`
            : `${target.tagName.toLowerCase()}.${target.className}`
          : String(target),
      }];
    });

    return {
      artifacts: stage.querySelectorAll("[data-trick-artifact]").length,
      activeAnimations,
      busy: stage.dataset.trickBusy,
      ariaBusy: stage.getAttribute("aria-busy"),
      attempts: stage.dataset.attempts,
      lastTrick: stage.dataset.lastTrick ?? null,
      swapped: stage.hasAttribute("data-swapped"),
      disguised: stage.hasAttribute("data-disguised"),
      locked: Boolean(stage.querySelector("[data-no][data-locked]")),
      yesScale: yesFace.style.getPropertyValue("--yes-scale"),
      noScale: noFace.style.getPropertyValue("--no-scale"),
      noPoseX: noSeat.style.getPropertyValue("--no-pose-x"),
      noPoseY: noSeat.style.getPropertyValue("--no-pose-y"),
      noRotation: noSeat.style.getPropertyValue("--no-rotation"),
      costume: noCostume.textContent,
      costumeHidden: noCostume.hidden,
    };
  });

  expect(residue).toEqual({
    artifacts: 0,
    activeAnimations: [],
    busy: "false",
    ariaBusy: "false",
    attempts: "0",
    lastTrick: null,
    swapped: false,
    disguised: false,
    locked: false,
    yesScale: "1",
    noScale: "1",
    noPoseX: "",
    noPoseY: "",
    noRotation: "",
    costume: "",
    costumeHidden: true,
  });
}

export async function waitForTrickIdle(page: Page): Promise<void> {
  const stage = page.locator("[data-stage]");
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
  await expect(stage).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function waitForInvitationLayout(page: Page): Promise<void> {
  await page.locator("[data-no]").focus();
  await expect(page.locator("[data-letter]")).toHaveAttribute("data-arrived", "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

export async function assertSafeNoGeometry(page: Page): Promise<void> {
  const geometry = await page.locator("[data-letter]").evaluate((letter) => {
    type Box = {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
    const box = (element: Element): Box => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const union = (values: readonly Box[]): Box => {
      const left = Math.min(...values.map((value) => value.left));
      const top = Math.min(...values.map((value) => value.top));
      const right = Math.max(...values.map((value) => value.right));
      const bottom = Math.max(...values.map((value) => value.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const expand = (value: Box, gap: number): Box => ({
      left: value.left - gap,
      top: value.top - gap,
      right: value.right + gap,
      bottom: value.bottom + gap,
      width: value.width + gap * 2,
      height: value.height + gap * 2,
    });
    const overlaps = (first: Box, second: Box): boolean => (
      first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top
    );
    const required = <ElementType extends Element>(selector: string): ElementType => {
      const element = document.querySelector<ElementType>(selector);
      if (!element) throw new Error(`Missing geometry element: ${selector}`);
      return element;
    };

    const letterBox = box(letter);
    const letterStyle = getComputedStyle(letter);
    const border = {
      left: Number.parseFloat(letterStyle.borderLeftWidth) || 0,
      right: Number.parseFloat(letterStyle.borderRightWidth) || 0,
      top: Number.parseFloat(letterStyle.borderTopWidth) || 0,
      bottom: Number.parseFloat(letterStyle.borderBottomWidth) || 0,
    };
    const safeLetter = {
      left: letterBox.left + border.left + 8,
      right: letterBox.right - border.right - 8,
      top: letterBox.top + border.top + 8 + 2,
      bottom: letterBox.bottom - border.bottom - 8,
    };
    const noButton = required<HTMLButtonElement>("[data-no]");
    const noRect = union([
      box(required("[data-no-seat]")),
      box(noButton),
      box(required("[data-no-face]")),
    ]);
    const yesRect = expand(
      union([box(required("[data-yes]")), box(required("[data-yes-face]"))]),
      12,
    );
    const protectedRects = Array.from(letter.querySelectorAll(
      ".eyebrow, [data-question], [data-note], .date-ticket, [data-signature], .tape, .wax-seal",
    )).map((element) => ({ selector: element.className || element.tagName, box: expand(box(element), 8) }));

    return {
      noRect,
      safeLetter,
      hit: { width: noButton.offsetWidth, height: noButton.offsetHeight },
      overlapsYes: overlaps(noRect, yesRect),
      protectedOverlap: protectedRects.find((entry) => overlaps(noRect, entry.box))?.selector ?? null,
      protectedRects,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.hit.width, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
  expect(geometry.hit.height, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
  expect(geometry.noRect.left, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.safeLetter.left);
  expect(geometry.noRect.right, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.safeLetter.right);
  expect(geometry.noRect.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.safeLetter.top);
  expect(geometry.noRect.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.safeLetter.bottom);
  expect(geometry.overlapsYes, JSON.stringify(geometry)).toBe(false);
  expect(geometry.protectedOverlap, JSON.stringify(geometry)).toBeNull();
  expect(geometry.overflow, JSON.stringify(geometry)).toBeLessThanOrEqual(1);

  const beforeX = await page.evaluate(() => window.scrollX);
  await page.locator("[data-no]").focus();
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const afterFocus = await page.evaluate((initialX) => ({
    horizontalDelta: Math.abs(window.scrollX - initialX),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    noFocused: document.activeElement === document.querySelector("[data-no]"),
  }), beforeX);
  expect(afterFocus.noFocused).toBe(true);
  expect(afterFocus.horizontalDelta).toBeLessThanOrEqual(1);
  expect(afterFocus.overflow).toBeLessThanOrEqual(1);
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
