import { expect, test, type Page } from "@playwright/test";
import type { TrickId } from "../../src/domain/trick-deck";
import {
  activateNoAndWait,
  buttonIdentityToken,
  forceTrickOrder,
  waitForTrickIdle,
} from "./trick-helpers";

interface Center {
  readonly x: number;
  readonly y: number;
}

interface NoGeometry {
  readonly center: Center;
  readonly distanceFromOrigin: number;
  readonly safe: boolean;
  readonly hitWidth: number;
  readonly hitHeight: number;
  readonly poseX: number;
  readonly poseY: number;
  readonly absoluteTranslation: boolean;
}

async function centerOf(page: Page, selector: string): Promise<Center> {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
}

async function settleLetter(page: Page): Promise<void> {
  await page.locator("[data-no]").focus();
  await expect(page.locator("[data-letter]")).toHaveAttribute("data-arrived", "true");
}

async function measureNoGeometry(page: Page, origin: Center): Promise<NoGeometry> {
  return page.locator("[data-no-seat]").evaluate((seat, initial) => {
    const no = seat.querySelector<HTMLButtonElement>("[data-no]")!;
    const yes = document.querySelector<HTMLButtonElement>("[data-yes]")!;
    const letter = document.querySelector<HTMLElement>("[data-letter]")!;
    const finalRect = no.getBoundingClientRect();
    const yesRect = yes.getBoundingClientRect();
    const letterRect = letter.getBoundingClientRect();
    const center = {
      x: finalRect.left + finalRect.width / 2,
      y: finalRect.top + finalRect.height / 2,
    };
    const poseX = Number.parseFloat(seat.style.getPropertyValue("--no-pose-x")) || 0;
    const poseY = Number.parseFloat(seat.style.getPropertyValue("--no-pose-y")) || 0;
    const previousTransition = seat.style.transition;
    const previousX = seat.style.getPropertyValue("--no-pose-x");
    const previousY = seat.style.getPropertyValue("--no-pose-y");
    const previousRotation = seat.style.getPropertyValue("--no-rotation");
    seat.style.transition = "none";
    seat.style.removeProperty("--no-pose-x");
    seat.style.removeProperty("--no-pose-y");
    seat.style.removeProperty("--no-rotation");
    const anchorRect = no.getBoundingClientRect();
    const anchor = {
      x: anchorRect.left + anchorRect.width / 2,
      y: anchorRect.top + anchorRect.height / 2,
    };
    seat.style.setProperty("--no-pose-x", previousX);
    seat.style.setProperty("--no-pose-y", previousY);
    seat.style.setProperty("--no-rotation", previousRotation);
    seat.style.transition = previousTransition;

    const separatedFromYes = finalRect.right <= yesRect.left - 12
      || finalRect.left >= yesRect.right + 12
      || finalRect.bottom <= yesRect.top - 12
      || finalRect.top >= yesRect.bottom + 12;
    return {
      center,
      distanceFromOrigin: Math.hypot(center.x - initial.x, center.y - initial.y),
      safe: finalRect.left >= Math.max(letterRect.left + 8, 0)
        && finalRect.right <= Math.min(letterRect.right - 8, innerWidth)
        && finalRect.top >= letterRect.top + 8
        && finalRect.bottom <= letterRect.bottom - 8
        && separatedFromYes,
      hitWidth: no.offsetWidth,
      hitHeight: no.offsetHeight,
      poseX,
      poseY,
      absoluteTranslation: Math.abs(center.x - anchor.x - poseX) < 1
        && Math.abs(center.y - anchor.y - poseY) < 1,
    };
  }, origin);
}

function expectStableCenter(before: Center, after: Center): void {
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
}

const SPATIAL_TRICKS = [
  "runaway-rsvp",
  "cupid-magnet",
  "paper-plane",
  "return-to-sender",
] as const satisfies readonly TrickId[];

for (const trick of SPATIAL_TRICKS) {
  test(`${trick} lands safely and keeps its final pose`, async ({ page }) => {
    await forceTrickOrder(page, [trick]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?to=Jamie");
    await settleLetter(page);
    const origin = await centerOf(page, "[data-no]");

    await page.locator("[data-no]").click();
    if (trick === "return-to-sender") {
      await expect(page.locator(".trick-return-stamp")).toBeAttached();
    }
    await waitForTrickIdle(page);

    const landed = await measureNoGeometry(page, origin);
    expect(landed.distanceFromOrigin).toBeGreaterThanOrEqual(24);
    expect(landed.safe).toBe(true);
    expect(landed.hitWidth).toBeGreaterThanOrEqual(44);
    expect(landed.hitHeight).toBeGreaterThanOrEqual(44);
    expect(landed.absoluteTranslation).toBe(true);
    await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", trick);
    await expect(page.locator("[data-trick-artifact]")).toHaveCount(0);

    await page.waitForTimeout(150);
    expectStableCenter(landed.center, await centerOf(page, "[data-no]"));
  });
}

test("a later spatial trick replaces the absolute NO translation", async ({ page }) => {
  await forceTrickOrder(page, ["runaway-rsvp", "paper-plane"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?to=Jamie");
  await settleLetter(page);
  const origin = await centerOf(page, "[data-no]");

  await activateNoAndWait(page);
  const first = await measureNoGeometry(page, origin);
  await activateNoAndWait(page);
  const second = await measureNoGeometry(page, origin);

  expect(first.safe).toBe(true);
  expect(first.absoluteTranslation).toBe(true);
  expect(second.safe).toBe(true);
  expect(second.absoluteTranslation).toBe(true);
  const replacementDistance = Math.hypot(
    second.center.x - first.center.x,
    second.center.y - first.center.y,
  );
  expect(replacementDistance).toBeGreaterThanOrEqual(24);
  expect({ x: second.poseX, y: second.poseY })
    .not.toEqual({ x: first.poseX, y: first.poseY });
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", "paper-plane");
  const letter = await page.locator("[data-letter]").boundingBox();
  expect(letter).not.toBeNull();
  expect(second.distanceFromOrigin).toBeLessThan(Math.hypot(letter!.width, letter!.height));
  await page.waitForTimeout(150);
  expectStableCenter(second.center, await centerOf(page, "[data-no]"));
});

test("Growing enlarges YES and shrinks only NO's visual face", async ({ page }) => {
  await forceTrickOrder(page, ["growing-feelings"]);
  await page.goto("/?to=Jamie");
  await page.locator("[data-yes]").focus();
  const before = await page.locator("[data-actions]").evaluate((actions) => {
    const yes = actions.querySelector<HTMLElement>("[data-yes-face]")!.getBoundingClientRect();
    const no = actions.querySelector<HTMLElement>("[data-no-face]")!.getBoundingClientRect();
    return { yesWidth: yes.width, yesHeight: yes.height, noWidth: no.width, noHeight: no.height };
  });

  await activateNoAndWait(page);
  const after = await page.locator("[data-actions]").evaluate((actions) => {
    const yesFace = actions.querySelector<HTMLElement>("[data-yes-face]")!;
    const noFace = actions.querySelector<HTMLElement>("[data-no-face]")!;
    const yes = yesFace.getBoundingClientRect();
    const no = noFace.getBoundingClientRect();
    const semanticNo = actions.querySelector<HTMLButtonElement>("[data-no]")!;
    const scaleX = (element: Element): number => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
    };
    return {
      yesWidth: yes.width,
      yesHeight: yes.height,
      noWidth: no.width,
      noHeight: no.height,
      hitWidth: semanticNo.offsetWidth,
      hitHeight: semanticNo.offsetHeight,
      yesScale: scaleX(yesFace),
      noScale: scaleX(noFace),
    };
  });

  expect(after.yesWidth).toBeGreaterThan(before.yesWidth);
  expect(after.noWidth).toBeLessThan(before.noWidth);
  expect(after.yesScale).toBeGreaterThan(1);
  expect(after.noScale).toBeLessThan(1);
  expect(after.hitWidth).toBeGreaterThanOrEqual(44);
  expect(after.hitHeight).toBeGreaterThanOrEqual(44);
});

test("Seat Swap reverses visual order without replacing either semantic button", async ({ page }) => {
  await forceTrickOrder(page, ["seat-swap"]);
  await page.goto("/?to=Jamie");
  await settleLetter(page);
  const yesToken = await buttonIdentityToken(page, "yes");
  const noToken = await buttonIdentityToken(page, "no");
  const before = {
    yes: await centerOf(page, "[data-yes]"),
    no: await centerOf(page, "[data-no]"),
  };
  expect(before.yes.x).toBeLessThan(before.no.x);

  await activateNoAndWait(page);
  const after = {
    yes: await centerOf(page, "[data-yes]"),
    no: await centerOf(page, "[data-no]"),
  };
  expect(after.no.x).toBeLessThan(after.yes.x);
  expect(await buttonIdentityToken(page, "yes")).toBe(yesToken);
  expect(await buttonIdentityToken(page, "no")).toBe(noToken);
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-swapped", "");
});

for (const swapped of [false, true]) {
  test(`Cupid Magnet lands safely ${swapped ? "after" : "before"} Seat Swap`, async ({ page }) => {
    await forceTrickOrder(page, swapped
      ? ["seat-swap", "cupid-magnet"]
      : ["cupid-magnet"]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?to=Jamie");
    await settleLetter(page);
    if (swapped) await activateNoAndWait(page);
    const origin = await centerOf(page, "[data-no]");

    await activateNoAndWait(page);
    const landed = await measureNoGeometry(page, origin);
    const diagnostics = {
      origin,
      landed,
      status: await page.locator("[data-status]").textContent(),
      lastTrick: await page.locator("[data-stage]").getAttribute("data-last-trick"),
    };
    expect(
      landed.distanceFromOrigin,
      `Magnet geometry: ${JSON.stringify(diagnostics)}`,
    ).toBeGreaterThanOrEqual(24);
    expect(landed.safe).toBe(true);
    expect(landed.absoluteTranslation).toBe(true);
    await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", "cupid-magnet");
    await expect(page.locator("[data-status]")).toContainText("Cupid's magnet");
    if (swapped) {
      await expect(page.locator("[data-stage]")).toHaveAttribute("data-swapped", "");
    } else {
      await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-swapped", "");
    }
  });
}

test("Garden owns and removes all of its temporary blooms", async ({ page }) => {
  await forceTrickOrder(page, ["yes-garden"]);
  await page.goto("/?to=Jamie");

  await page.locator("[data-no]").click();
  await expect(page.locator(".trick-garden-item[data-trick-artifact]")).toHaveCount(8);
  await waitForTrickIdle(page);

  await expect(page.locator(".trick-garden-item")).toHaveCount(0);
  await expect(page.locator("[data-trick-artifact]")).toHaveCount(0);
});

test("Dramatic Excuse is separate and never mutates NO copy or width", async ({ page }) => {
  await forceTrickOrder(page, ["dramatic-excuse"]);
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const label = page.locator("[data-no-label]");
  const initialLabel = await label.textContent();
  const initialWidth = await no.evaluate((button) => (button as HTMLElement).offsetWidth);

  await no.click();
  const excuse = page.locator(".trick-excuse");
  await expect(excuse).toBeAttached();
  await expect(excuse).toContainText("DESSERT");
  expect(await excuse.evaluate((bubble) => (
    !document.querySelector("[data-no-label]")!.contains(bubble)
  ))).toBe(true);
  await expect(label).toHaveText(initialLabel!);
  expect(await no.evaluate((button) => (button as HTMLElement).offsetWidth)).toBe(initialWidth);

  await waitForTrickIdle(page);
  await expect(excuse).toHaveCount(0);
  await expect(label).toHaveText(initialLabel!);
  expect(await no.evaluate((button) => (button as HTMLElement).offsetWidth)).toBe(initialWidth);
});

for (const swapped of [false, true]) {
  test(`Spotlight targets semantic YES ${swapped ? "after" : "before"} Seat Swap`, async ({ page }) => {
    await forceTrickOrder(page, swapped ? ["seat-swap", "spotlight"] : ["spotlight"]);
    await page.goto("/?to=Jamie");
    if (swapped) await activateNoAndWait(page);

    await page.locator("[data-no]").click();
    const overlay = page.locator(".trick-spotlight-overlay");
    await expect(overlay).toBeAttached();
    await expect.poll(async () => Number.parseFloat(await overlay.evaluate((node) => (
      getComputedStyle(node).opacity
    )))).toBeGreaterThan(0.2);
    const distances = await overlay.evaluate((node) => {
      const style = getComputedStyle(node);
      const letterRect = node.parentElement!.getBoundingClientRect();
      const yesRect = document.querySelector<HTMLElement>("[data-yes]")!.getBoundingClientRect();
      const noRect = document.querySelector<HTMLElement>("[data-no]")!.getBoundingClientRect();
      const focus = {
        x: letterRect.left + Number.parseFloat(style.getPropertyValue("--spotlight-x")),
        y: letterRect.top + Number.parseFloat(style.getPropertyValue("--spotlight-y")),
      };
      const distance = (rect: DOMRect): number => Math.hypot(
        focus.x - (rect.left + rect.width / 2),
        focus.y - (rect.top + rect.height / 2),
      );
      return { yes: distance(yesRect), no: distance(noRect) };
    });
    expect(distances.yes).toBeLessThan(distances.no);
    expect(distances.yes).toBeLessThan(1);

    await waitForTrickIdle(page);
    await expect(overlay).toHaveCount(0);
  });
}

test("Tiny Disguise persists until the next accepted trick click", async ({ page }) => {
  await forceTrickOrder(page, ["tiny-disguise", "growing-feelings"]);
  await page.goto("/?to=Jamie");

  await activateNoAndWait(page);
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-disguised", "");
  await expect(page.getByRole("button", { name: /NO/i })).toBeVisible();
  await expect(page.locator("[data-no-costume]")).not.toBeEmpty();

  await page.locator("[data-no]").click();
  await expect(page.locator("[data-stage]")).not.toHaveAttribute("data-disguised", "");
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", "growing-feelings");
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-attempts", "2");
  await waitForTrickIdle(page);
  await expect(page.locator("[data-no-costume]")).toBeEmpty();
});

test("Tiny Disguise as attempt eight survives refusal readiness but not confirmation", async ({ page }) => {
  await forceTrickOrder(page, [
    "runaway-rsvp",
    "growing-feelings",
    "seat-swap",
    "cupid-magnet",
    "paper-plane",
    "yes-garden",
    "dramatic-excuse",
    "tiny-disguise",
  ]);
  await page.goto("/?to=Jamie");

  for (let attempt = 0; attempt < 8; attempt += 1) await activateNoAndWait(page);
  const stage = page.locator("[data-stage]");
  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(stage).toHaveAttribute("data-last-trick", "tiny-disguise");
  await expect(stage).toHaveAttribute("data-disguised", "");
  await expect(page.locator("[data-no-costume]")).not.toBeEmpty();
  await expect(page.locator("[data-no-label]")).toContainText("Okay, I'll behave");

  await page.locator("[data-no]").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(stage).not.toHaveAttribute("data-disguised", "");
  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(stage).toHaveAttribute("data-last-trick", "tiny-disguise");
  await expect(page.locator("[data-no-costume]")).toBeEmpty();
});
