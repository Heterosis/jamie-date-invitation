import { expect, test } from "@playwright/test";

test("renders URL-provided invitation content", async ({ page }) => {
  await page.goto("/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&place=Botanic+Gardens&note=Bring+a+smile");
  await expect(page.getByRole("heading", { name: "Jamie, will you go on a date with me?" })).toBeVisible();
  await expect(page.getByText("Bring a smile")).toBeVisible();
  await expect(page.getByText("Saturday, August 8, 2026")).toBeVisible();
  await expect(page.getByText("7:30 PM")).toBeVisible();
  await expect(page.getByText("Botanic Gardens")).toBeVisible();
  await expect(page.getByText("from Alex")).toBeVisible();
});

test("renders romantic fallbacks without inventing calendar facts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Date to be decided")).toBeVisible();
  await expect(page.getByText("Time to be decided")).toBeVisible();
  await expect(page.getByText("A little surprise ✦")).toBeVisible();
  await expect(page.getByText("from someone with butterflies")).toBeVisible();
});

test("inserts URL content as text rather than HTML", async ({ page }) => {
  await page.goto(`/?to=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByRole("heading")).toContainText("<img src=x onerror=alert(1)>");
});

test("fits a 320px viewport without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/?to=Jamie");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("contains long unbroken invitation copy and actions at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(`/?to=${"W".repeat(40)}`);

  await page.locator("[data-letter]").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(async (animation) => {
      try { await animation.finished; } catch { /* The measurement still uses the settled DOM. */ }
    }));
  });

  const metrics = await page.evaluate(() => {
    const required = (selector: string): HTMLElement => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing test element: ${selector}`);
      return element;
    };
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const heading = required("[data-question]");

    return {
      viewportWidth: window.innerWidth,
      heading: { ...bounds(heading), scrollWidth: heading.scrollWidth, clientWidth: heading.clientWidth },
      letter: bounds(required("[data-letter]")),
      yes: bounds(required("[data-yes]")),
      no: bounds(required("[data-no]")),
      seal: bounds(required(".wax-seal")),
    };
  });

  const overlaps = (
    first: { left: number; right: number; top: number; bottom: number },
    second: { left: number; right: number; top: number; bottom: number },
  ) => first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;

  expect.soft(metrics.heading.scrollWidth, "heading scroll width").toBeLessThanOrEqual(metrics.heading.clientWidth);
  expect.soft(metrics.letter.left, "letter left edge").toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.letter.right, "letter right edge").toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect.soft(metrics.heading.left, "heading left edge").toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.heading.right, "heading right edge").toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect.soft(metrics.yes.left, "YES left edge").toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.yes.right, "YES right edge").toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect.soft(metrics.no.left, "NO left edge").toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.no.right, "NO right edge").toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect.soft(overlaps(metrics.seal, metrics.yes), "wax seal must not overlap YES").toBe(false);
  expect.soft(overlaps(metrics.seal, metrics.no), "wax seal must not overlap NO").toBe(false);
});
