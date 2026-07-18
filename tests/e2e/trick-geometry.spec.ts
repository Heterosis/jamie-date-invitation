import { expect, test, type Page } from "@playwright/test";
import type { TrickId } from "../../src/domain/trick-deck";
import {
  activateNoAndWait,
  assertSafeNoGeometry,
  forceTrickOrder,
  waitForInvitationLayout,
  waitForTrickIdle,
} from "./trick-helpers";

const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const COPY_CASES = [
  { name: "default copy", url: "/?to=Jamie" },
  {
    name: "maximum copy",
    url: "/?to=" + "W".repeat(40)
      + "&from=" + "W".repeat(40)
      + "&place=" + "W".repeat(100)
      + "&note=" + "W".repeat(240),
  },
] as const;

const PERSISTENT_ORDER = [
  "runaway-rsvp",
  "growing-feelings",
  "seat-swap",
  "cupid-magnet",
  "paper-plane",
  "spotlight",
  "tiny-disguise",
  "return-to-sender",
] as const satisfies readonly TrickId[];

async function openReducedInvitation(
  page: Page,
  order: readonly TrickId[],
  url = "/?to=Jamie",
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await forceTrickOrder(page, order);
  await page.goto(url);
  await waitForInvitationLayout(page);
}

async function runAndAssert(
  page: Page,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await test.step(`settled transaction ${index + 1}`, async () => {
      await activateNoAndWait(page);
      await assertSafeNoGeometry(page);
    });
  }
}

interface Edges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function captureLastFrameAndFinish(page: Page): Promise<Edges> {
  await page.locator("[data-no]").click();
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-trick-busy", "true");
  const beforeFinish = await page.locator("[data-stage]").evaluate(async (stage) => {
    const animations = stage.getAnimations({ subtree: true }).filter((animation) => {
      if (!(animation.effect instanceof KeyframeEffect)) return false;
      const target = animation.effect.target;
      return target instanceof Element
        && target.matches("[data-yes-motion], [data-no-motion], [data-yes-face], [data-no-face]")
        && animation.playState !== "finished"
        && animation.playState !== "idle";
    });
    if (animations.length === 0) throw new Error("No owned trick motion was active");
    for (const animation of animations) {
      animation.pause();
      const endTime = animation.effect!.getComputedTiming().endTime;
      if (typeof endTime !== "number" || !Number.isFinite(endTime)) {
        throw new Error("Owned trick motion has no finite end time");
      }
      animation.currentTime = endTime;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const value = stage.querySelector("[data-no]")!.getBoundingClientRect();
    const result = {
      left: value.left,
      top: value.top,
      right: value.right,
      bottom: value.bottom,
    };
    animations.forEach((animation) => animation.finish());
    return result;
  });
  await waitForTrickIdle(page);
  return beforeFinish;
}

async function noEdges(page: Page): Promise<Edges> {
  return page.locator("[data-no]").evaluate((element) => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
  });
}

function expectEdgesWithinOne(before: Edges, after: Edges): void {
  for (const edge of ["left", "top", "right", "bottom"] as const) {
    expect(Math.abs(before[edge] - after[edge]), `${edge}: ${JSON.stringify({ before, after })}`)
      .toBeLessThanOrEqual(1);
  }
}

test.describe("persistent trick geometry matrix", () => {
  for (const viewport of VIEWPORTS) {
    for (const copyCase of COPY_CASES) {
      test(`${viewport.width}x${viewport.height} with ${copyCase.name}`, async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop matrix");
        await page.setViewportSize(viewport);
        await openReducedInvitation(page, PERSISTENT_ORDER, copyCase.url);
        await assertSafeNoGeometry(page);
        await runAndAssert(page, PERSISTENT_ORDER.length);
      });
    }
  }
});

test("Seat Swap before Cupid Magnet keeps a safe pose", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop composition");
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReducedInvitation(page, ["seat-swap", "cupid-magnet"]);
  await runAndAssert(page, 2);
});

test("Seat Swap before Paper Plane keeps a safe pose", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop composition");
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReducedInvitation(page, ["seat-swap", "paper-plane"]);
  await runAndAssert(page, 2);
});

test("Growing revalidates an existing pose without snap-back", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop composition");
  await page.setViewportSize({ width: 1280, height: 900 });
  await forceTrickOrder(page, ["runaway-rsvp", "growing-feelings"]);
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  await activateNoAndWait(page);
  const lastFrame = await captureLastFrameAndFinish(page);
  expectEdgesWithinOne(lastFrame, await noEdges(page));
  await assertSafeNoGeometry(page);
});

test("Seat Swap revalidates an existing pose without snap-back", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop composition");
  await page.setViewportSize({ width: 1280, height: 900 });
  await forceTrickOrder(page, ["runaway-rsvp", "seat-swap"]);
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  await activateNoAndWait(page);
  const lastFrame = await captureLastFrameAndFinish(page);
  expectEdgesWithinOne(lastFrame, await noEdges(page));
  await assertSafeNoGeometry(page);
});

test("desktop resize revalidates the current pose", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop resize");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReducedInvitation(page, ["runaway-rsvp"]);
  await activateNoAndWait(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await waitForInvitationLayout(page);
  await assertSafeNoGeometry(page);
});

test("persistent layer combinations never create horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop composition");
  await page.setViewportSize({ width: 768, height: 1024 });
  await openReducedInvitation(page, [
    "runaway-rsvp",
    "growing-feelings",
    "seat-swap",
    "tiny-disguise",
    "paper-plane",
  ]);
  await runAndAssert(page, 5);
});

test.describe("1280x900 physical viewport at 200 percent zoom", () => {
  test.use({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });

  test("keeps persistent tricks horizontally reflowed and focusable", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop zoom model");
    await openReducedInvitation(page, PERSISTENT_ORDER);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([640, 450]);
    await assertSafeNoGeometry(page);
    await runAndAssert(page, PERSISTENT_ORDER.length);
  });
});
