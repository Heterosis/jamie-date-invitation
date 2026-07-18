import { expect, test, type Page } from "@playwright/test";
import { TRICK_IDS, type TrickId } from "../../src/domain/trick-deck";
import {
  activateNoAndWait,
  assertSafeNoGeometry,
  buttonIdentityToken,
  forceTrickOrder,
  waitForInvitationLayout,
  waitForTrickIdle,
} from "./trick-helpers";

const PERSISTENT_ORDER = [
  "runaway-rsvp",
  "growing-feelings",
  "seat-swap",
  "cupid-magnet",
  "paper-plane",
  "spotlight",
  "return-to-sender",
  "tiny-disguise",
] as const satisfies readonly TrickId[];

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

  await activateNoAndWait(page, "enter");
  await expect(status).not.toBeEmpty();
  await expect(status).toHaveAttribute("aria-live", "polite");

  for (let index = 1; index < 8; index += 1) {
    await activateNoAndWait(page, index % 2 === 0 ? "enter" : "space");
  }
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-attempts", "8");
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator("[data-no]").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeFocused();
});

test("keeps pointerenter inert and NO focusable during a politely announced busy run", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");
  const status = page.getByRole("status");

  await no.dispatchEvent("pointerenter", { pointerType: "mouse" });
  await expect(stage).toHaveAttribute("data-attempts", "0");
  await expect(stage).not.toHaveAttribute("data-last-trick");

  await page.locator("[data-letter]").evaluate(async (letter) => {
    await Promise.all(
      letter.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  await no.focus();
  await page.keyboard.press("Enter");
  await expect(stage).toHaveAttribute("data-trick-busy", "true");
  const activeTrick = await stage.getAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("[data-yes]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(no).toBeFocused();
  await no.dispatchEvent("pointerenter", { pointerType: "mouse" });
  await page.keyboard.press("Space");

  await expect(no).toBeFocused();
  await expect(no).toBeEnabled();
  await expect(stage).toHaveAttribute("data-attempts", "1");
  await expect(stage).toHaveAttribute("data-last-trick", activeTrick!);
  await expect(status).toContainText("finish");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await waitForTrickIdle(page);
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

  const stage = page.locator("[data-stage]");
  await activateNoAndWait(page);
  await expect(stage).toHaveAttribute("data-last-trick", "runaway-rsvp");
  await expect(stage).toHaveAttribute("data-attempts", "1");
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
  await expect(stage).toHaveAttribute("aria-busy", "false");
  await expect(stage.locator("[data-trick-artifact]")).toHaveCount(0);

  await page.locator("[data-yes]").dispatchEvent("click");
  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  await expect(stage.locator("[data-trick-artifact]")).toHaveCount(0);
});

test("uses eight taps for eight transactions before touch opens genuine refusal", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Touch behavior is exercised by the mobile project");
  await page.goto("/?to=Jamie");
  const stage = page.locator("[data-stage]");
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page, "tap");

  await expect(stage).toHaveAttribute("data-attempts", "8");
  await expect(stage).toHaveAttribute("data-last-trick", /.+/);
  await expect(page.locator("[data-success]")).toBeHidden();
  await expect(page.getByRole("button", { name: "Okay, I'll behave…" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator("[data-no]").tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(stage).toHaveAttribute("data-attempts", "8");
});

for (const keyboard of ["enter", "space"] as const) {
  test(`${keyboard === "enter" ? "Enter" : "Space"} accepts exactly one NO transaction`, async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("desktop"),
      "Desktop coverage avoids duplicating the same keyboard case on Pixel",
    );
    await page.goto("/?to=Jamie");
    await waitForInvitationLayout(page);
    await activateNoAndWait(page, keyboard);
    await expect(page.locator("[data-stage]")).toHaveAttribute("data-attempts", "1");
    await expect(page.getByRole("status")).not.toBeEmpty();
  });
}

test("one mobile tap accepts exactly one NO transaction", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Touch behavior is exercised by mobile");
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  await activateNoAndWait(page, "tap");
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-attempts", "1");
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-last-trick", /.+/);
  await expect(page.locator("[data-success]")).toBeHidden();
});

test("moving and swapping preserve semantic nodes and NO focus", async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("desktop"),
    "Desktop coverage avoids duplicating the same keyboard case on Pixel",
  );
  await forceTrickOrder(page, ["runaway-rsvp", "seat-swap"]);
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  const yesToken = await buttonIdentityToken(page, "yes");
  const noToken = await buttonIdentityToken(page, "no");

  for (let index = 0; index < 2; index += 1) {
    await activateNoAndWait(page, "enter");
    await expect(page.locator("[data-no]")).toBeFocused();
    expect(await buttonIdentityToken(page, "yes")).toBe(yesToken);
    expect(await buttonIdentityToken(page, "no")).toBe(noToken);
  }
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-swapped", "");
});

for (const trick of TRICK_IDS) {
  test(`${trick} announces polite text before settling`, async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("desktop"),
      "Desktop coverage avoids duplicating the same live-region case on Pixel",
    );
    await forceTrickOrder(page, [trick]);
    await page.goto("/?to=Jamie");
    await waitForInvitationLayout(page);
    const stage = page.locator("[data-stage]");
    const status = page.getByRole("status");

    await page.locator("[data-no]").click();
    await expect(stage).toHaveAttribute("data-trick-busy", "true");
    await expect(stage).toHaveAttribute("data-last-trick", trick);
    await expect(status).not.toBeEmpty();
    await expect(status).toHaveAttribute("aria-live", "polite");
    await waitForTrickIdle(page);
  });
}

interface PersistentSnapshot {
  readonly attempts: string | undefined;
  readonly swapped: boolean;
  readonly disguised: boolean;
  readonly yesScale: string;
  readonly noScale: string;
  readonly noPoseX: string;
  readonly noPoseY: string;
  readonly noRotation: string;
}

async function completeModeFlow(page: Page, reducedMotion: boolean): Promise<PersistentSnapshot> {
  await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await forceTrickOrder(page, PERSISTENT_ORDER);
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page);
  return page.locator("[data-stage]").evaluate((stage) => {
    const yesFace = stage.querySelector<HTMLElement>("[data-yes-face]")!;
    const noFace = stage.querySelector<HTMLElement>("[data-no-face]")!;
    const noSeat = stage.querySelector<HTMLElement>("[data-no-seat]")!;
    return {
      attempts: stage.dataset.attempts,
      swapped: stage.hasAttribute("data-swapped"),
      disguised: stage.hasAttribute("data-disguised"),
      yesScale: yesFace.style.getPropertyValue("--yes-scale"),
      noScale: noFace.style.getPropertyValue("--no-scale"),
      noPoseX: noSeat.style.getPropertyValue("--no-pose-x"),
      noPoseY: noSeat.style.getPropertyValue("--no-pose-y"),
      noRotation: noSeat.style.getPropertyValue("--no-rotation"),
    };
  });
}

test("Reduced Motion completes eight tricks with the same persistent state", async ({ context }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("desktop"),
    "Desktop coverage avoids duplicating the same Reduced Motion flow on Pixel",
  );
  const fullPage = await context.newPage();
  const full = await completeModeFlow(fullPage, false);
  await fullPage.close();
  const reducedPage = await context.newPage();
  const reduced = await completeModeFlow(reducedPage, true);
  await reducedPage.close();

  expect(reduced).toEqual(full);
  expect(reduced.attempts).toBe("8");
});

test("mobile portrait-to-landscape resize revalidates the current pose", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile orientation case");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await forceTrickOrder(page, ["runaway-rsvp"]);
  await page.goto("/?to=Jamie");
  await waitForInvitationLayout(page);
  await activateNoAndWait(page, "tap");
  await page.setViewportSize({ width: 844, height: 390 });
  await waitForTrickIdle(page);
  await expect(page.locator("[data-no]")).toBeFocused();
  await assertSafeNoGeometry(page);
});
