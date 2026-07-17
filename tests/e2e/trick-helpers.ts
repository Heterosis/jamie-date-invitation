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
