import { expect, test } from "@playwright/test";
import {
  assertNoTrickResidue,
  capturePageErrors,
  forceTrickOrder,
  unlockRealNo,
} from "./trick-helpers";

async function seedResultTrickResidue(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-stage]").evaluate((stage) => {
    stage.dataset.lastTrick = "spotlight";
    stage.dataset.attempts = "4";
    stage.dataset.trickBusy = "true";
    stage.setAttribute("aria-busy", "true");
    stage.setAttribute("data-swapped", "");
    stage.setAttribute("data-disguised", "");
    stage.querySelector<HTMLElement>("[data-yes-face]")!
      .style.setProperty("--yes-scale", "1.4");
    stage.querySelector<HTMLElement>("[data-no-face]")!
      .style.setProperty("--no-scale", ".72");
    stage.querySelector<HTMLElement>("[data-no-seat]")!
      .style.setProperty("--no-pose-x", "45px");
    stage.querySelector<HTMLElement>("[data-no-seat]")!
      .style.setProperty("--no-pose-y", "25px");
    stage.querySelector<HTMLElement>("[data-no-seat]")!
      .style.setProperty("--no-rotation", "5deg");
    stage.querySelector<HTMLElement>("[data-no]")!.dataset.locked = "true";
    const costume = stage.querySelector<HTMLElement>("[data-no-costume]")!;
    costume.hidden = false;
    costume.textContent = "🥸";
    for (const className of [
      "trick-spotlight-overlay",
      "trick-garden-item",
      "trick-excuse",
      "trick-return-stamp",
    ]) {
      const artifact = document.createElement("span");
      artifact.className = className;
      artifact.dataset.trickArtifact = "true";
      stage.querySelector("[data-letter]")?.append(artifact);
    }
  });
}

test("YES celebrates without opening external pages automatically", async ({ page, context }) => {
  await page.goto("/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&telegram=alex_date&notifyName=Alex");
  const pagesBefore = context.pages().length;
  await page.getByRole("button", { name: "YES, I'D LOVE TO" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  await assertNoTrickResidue(page);
  expect(context.pages()).toHaveLength(pagesBefore);

  const calendar = page.getByRole("link", { name: "+ GOOGLE CALENDAR" });
  expect(new URL((await calendar.getAttribute("href"))!).hostname).toBe("calendar.google.com");
  const telegram = page.getByRole("link", { name: "TELL ALEX ON TELEGRAM" });
  expect(new URL((await telegram.getAttribute("href"))!).pathname).toBe("/alex_date");
});

test("keeps the entrance settled after focus leaves an interacted letter", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const letter = page.locator("[data-letter]");
  const no = page.locator("[data-no]");
  const status = page.locator("[data-status]");

  await no.focus();
  await no.dispatchEvent("click");
  await status.evaluate((element) => {
    element.tabIndex = -1;
    element.focus();
  });

  await expect(status).toBeFocused();
  await expect(letter).toHaveCSS("animation-name", "none");
  await expect(letter).toHaveAttribute("data-arrived", "true");
});

test("success decorations do not cover desktop content or the Telegram action", async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("desktop"),
    "Desktop success-card geometry regression",
  );

  await page.setViewportSize({ width: 1872, height: 990 });
  await page.goto(
    "/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&telegram=alex_date&notifyName=YOU-KNOW-WHO",
  );

  await page.locator("[data-yes]").click();
  await expect(page.locator("[data-success]")).toBeVisible();

  const letter = page.locator("[data-letter]");
  await letter.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  const blockers = await page
    .locator(".eyebrow, [data-telegram]")
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);

        if (hit === element || element.contains(hit)) return [];

        return [{
          target: element.matches(".eyebrow") ? "eyebrow" : "telegram",
          hit: hit instanceof HTMLElement
            ? `${hit.tagName.toLowerCase()}.${hit.className}`
            : String(hit),
        }];
      }),
    );

  const decorations = await letter.evaluate((element) => {
    const letterStyle = getComputedStyle(element);
    const pseudoElements = [
      {
        selector: "::before",
        gutter: Number.parseFloat(letterStyle.paddingInlineStart),
        edge: "start",
      },
      {
        selector: "::after",
        gutter: Number.parseFloat(letterStyle.paddingInlineEnd),
        edge: "end",
      },
    ] as const;

    return pseudoElements.map(({ selector, gutter, edge }) => {
      const style = getComputedStyle(element, selector);
      const matrix = style.transform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(style.transform);
      const width = Number.parseFloat(style.width);
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const expansion = (width * scaleX - width) / 2;
      const inset = Number.parseFloat(edge === "start"
        ? style.insetInlineStart
        : style.insetInlineEnd);

      return {
        pointerEvents: style.pointerEvents,
        width,
        staysInsideGutter:
          inset - expansion >= 0
          && inset + width + expansion <= gutter,
      };
    });
  });

  expect.soft(blockers).toEqual([]);
  expect.soft(decorations.every(({ pointerEvents }) => pointerEvents === "none")).toBe(true);
  expect.soft(decorations.every(({ width }) => width <= 56)).toBe(true);
  expect.soft(decorations.every(({ staysInsideGutter }) => staysInsideGutter)).toBe(true);

  // Verify pointer accessibility without opening Telegram.
  await page.locator("[data-telegram]").click({
    trial: true,
    timeout: 2_000,
  });
});

test("clears trick visuals before showing YES result actions in order", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await seedResultTrickResidue(page);
  await page.locator("[data-yes]").click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  await assertNoTrickResidue(page);

  const stage = page.locator("[data-stage]");
  await expect(stage).not.toHaveAttribute("data-swapped");
  await expect(stage).not.toHaveAttribute("data-disguised");
  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  await expect(stage.locator("[data-trick-artifact]")).toHaveCount(0);
  const resetVisuals = await stage.evaluate((element) => ({
    yesScale: element.querySelector<HTMLElement>("[data-yes-face]")!
      .style.getPropertyValue("--yes-scale"),
    noScale: element.querySelector<HTMLElement>("[data-no-face]")!
      .style.getPropertyValue("--no-scale"),
    noPoseX: element.querySelector<HTMLElement>("[data-no-seat]")!
      .style.getPropertyValue("--no-pose-x"),
    costume: element.querySelector<HTMLElement>("[data-no-costume]")!.textContent,
  }));
  expect.soft(resetVisuals).toEqual({ yesScale: "1", noScale: "1", noPoseX: "", costume: "" });

  const result = await stage.evaluate((element) => {
    const actions = element.querySelector<HTMLElement>(".result-actions")!;
    const calendar = actions.querySelector<HTMLElement>("[data-calendar]")!;
    const telegram = actions.querySelector<HTMLElement>("[data-telegram]")!;
    const label = (action: Element) => action.hasAttribute("data-calendar") ? "calendar" : "telegram";
    const calendarBox = calendar.getBoundingClientRect();
    const telegramBox = telegram.getBoundingClientRect();
    const sameRow = Math.abs(calendarBox.top - telegramBox.top) < Math.min(calendarBox.height, telegramBox.height) / 2;
    const calendarComesFirst = sameRow ? calendarBox.left < telegramBox.left : calendarBox.top < telegramBox.top;
    const decoration = getComputedStyle(element.querySelector<HTMLElement>("[data-letter]")!, "::after");
    return {
      domOrder: Array.from(actions.children).map(label),
      visualOrder: calendarComesFirst ? ["calendar", "telegram"] : ["telegram", "calendar"],
      decorationContent: decoration.content,
      decorationBackground: decoration.backgroundImage,
    };
  });

  expect.soft(result.domOrder).toEqual(["calendar", "telegram"]);
  expect.soft(result.visualOrder).toEqual(["calendar", "telegram"]);
  expect.soft(result.decorationContent).toContain("♥");
  expect.soft(result.decorationBackground).toBe("none");
});

test("YES during a busy trick cancels immediately and celebrates once", async ({ page }) => {
  const errors = capturePageErrors(page);
  await forceTrickOrder(page, ["paper-plane"]);
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  const stage = page.locator("[data-stage]");

  await page.locator("[data-no]").click();
  await expect(stage).toHaveAttribute("data-trick-busy", "true");
  await page.locator("[data-yes]").click();

  await expect(page.locator("[data-success]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toHaveCount(1);
  await assertNoTrickResidue(page);
  expect(errors).toEqual([]);

  const terminalStatus = await page.getByRole("status").textContent();
  const terminalHeading = await page.getByRole("heading", { name: "It's a date!" }).textContent();
  await page.waitForTimeout(1_300);
  await expect(page.getByRole("status")).toHaveText(terminalStatus!);
  await expect(page.getByRole("heading", { name: "It's a date!" })).toHaveText(terminalHeading!);
  await expect(page.getByRole("heading", { name: "It's a date!" })).toHaveCount(1);
  await assertNoTrickResidue(page);
  expect(errors).toEqual([]);
});

test("accepts a genuine refusal only after the dramatic confirmation", async ({ page }) => {
  await page.goto("/?to=Jamie&telegram=alex_date");
  await unlockRealNo(page);
  await page.getByRole("button", { name: "Okay, I'll behave…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).click();
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeVisible();
  await assertNoTrickResidue(page);
  await expect(page.locator("[data-calendar]")).toBeHidden();
  await expect(page.locator("[data-telegram]")).toBeHidden();
});

test("clears trick visuals before showing the genuine NO result", async ({ page }) => {
  await page.goto("/?to=Jamie");
  await unlockRealNo(page);
  await page.getByRole("button", { name: "Okay, I'll behave…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await seedResultTrickResidue(page);
  await page.getByRole("button", { name: "Yes, I really mean no" }).click();

  const stage = page.locator("[data-stage]");
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeVisible();
  await assertNoTrickResidue(page);
  await expect(stage).not.toHaveAttribute("data-swapped");
  await expect(stage).not.toHaveAttribute("data-disguised");
  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  await expect(stage.locator("[data-trick-artifact]")).toHaveCount(0);
  const resetVisuals = await stage.evaluate((element) => ({
    yesScale: element.querySelector<HTMLElement>("[data-yes-face]")!
      .style.getPropertyValue("--yes-scale"),
    noScale: element.querySelector<HTMLElement>("[data-no-face]")!
      .style.getPropertyValue("--no-scale"),
    noPoseX: element.querySelector<HTMLElement>("[data-no-seat]")!
      .style.getPropertyValue("--no-pose-x"),
    costume: element.querySelector<HTMLElement>("[data-no-costume]")!.textContent,
  }));
  expect.soft(resetVisuals).toEqual({ yesScale: "1", noScale: "1", noPoseX: "", costume: "" });
});

test("Actually, yes returns from confirmation to celebration", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await unlockRealNo(page);
  await page.getByRole("button", { name: "Okay, I'll behave…" }).click();
  await seedResultTrickResidue(page);
  await page.getByRole("button", { name: "Actually, yes" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  await assertNoTrickResidue(page);
});

test("reopens refusal confirmation after Escape and still accepts genuine refusal", async ({ page }) => {
  await page.goto("/?to=Jamie&telegram=alex_date");
  await unlockRealNo(page);
  const genuineNo = page.getByRole("button", { name: "Okay, I'll behave…" });
  const dialog = page.getByRole("dialog");
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-success]")).toBeHidden();
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Yes, I really mean no" }).click();
  await expect(page.getByRole("heading", { name: "No worries ♥" })).toBeVisible();
  await assertNoTrickResidue(page);
});

test("reopens refusal confirmation after Escape and still accepts Actually yes", async ({ page }) => {
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");
  await unlockRealNo(page);
  const genuineNo = page.getByRole("button", { name: "Okay, I'll behave…" });
  const dialog = page.getByRole("dialog");
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-success]")).toBeHidden();
  await genuineNo.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Actually, yes" }).click();
  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  await assertNoTrickResidue(page);
});
