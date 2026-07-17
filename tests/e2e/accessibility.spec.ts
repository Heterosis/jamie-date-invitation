import { expect, test } from "@playwright/test";
import { activateNoAndWait, waitForTrickIdle } from "./trick-helpers";

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
