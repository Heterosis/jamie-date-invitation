# Trick Animation Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make seven existing NO tricks more visually emphatic, longer-lived, and legible while preserving safe geometry, semantics, cancellation, Reduced Motion, and cleanup.

**Architecture:** Keep the existing effect → geometry preview → runner lifecycle pipeline. Tune state bounds and effect keyframes in place; add one runner-owned Paper Plane crease artifact inside the existing NO face, with direction derived from the approved safe landing delta. Lock behavior with unit tests first, then deterministic Playwright animation seeking and the complete project verification suite.

**Tech Stack:** TypeScript 7, DOM Web Animations API, CSS, Vitest 4, Playwright 1.61, Vite 8.

---

## File map

- `src/ui/trick-state.ts` — persistent visual-state bounds for Growing Feelings.
- `src/ui/trick-state.test.ts` — direct proof of the new scale clamps.
- `src/ui/trick-effects.ts` — all seven tuned effect timelines and Paper Plane direction/fold helpers.
- `src/ui/trick-effects.test.ts` — unit-level patches, keyframes, timing, ownership, fallback, and direction tests.
- `src/styles/tricks.css` — runner-owned Paper Plane crease-layer styling only.
- `tests/e2e/trick-helpers.ts` — deterministic helpers that seek and resume runner-owned animations.
- `tests/e2e/trick-catalog.spec.ts` — browser proof for large Growing state, longer transient holds, Paper Plane semantics, and cleanup.

No new runtime module or trick ID is needed. The current files already own these responsibilities, and splitting a seven-effect registry solely for parameter tuning would add indirection without a new boundary.

### Task 0: Prepare and baseline the isolated worktree

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`

- [ ] **Step 1: Install the locked dependencies in this worktree**

Run:

```powershell
npm ci
```

Expected: npm installs the versions in `package-lock.json` without changing either package manifest.

- [ ] **Step 2: Verify the branch starts from a green baseline**

Run:

```powershell
npm run check
git status --short
```

Expected: all baseline checks pass, and Git reports only the already-committed design and plan history with no tracked-file changes. If the baseline fails, record the failure and stop before changing implementation code.

### Task 1: Make Growing Feelings reach the approved 1.75× / 0.50× state

**Files:**
- Modify: `src/ui/trick-state.test.ts:39-48`
- Modify: `src/ui/trick-effects.test.ts:12-18,369-384,748-775`
- Modify: `tests/e2e/trick-catalog.spec.ts:163-202`
- Modify: `src/ui/trick-state.ts:17-18`
- Modify: `src/ui/trick-effects.ts:1-3,125-145`

- [ ] **Step 1: Write failing state, effect, and browser expectations**

In `src/ui/trick-state.test.ts`, make the bounds explicit inside the clamp test:

```ts
it("clamps configured scale bounds and freezes emitted state", () => {
  expect(MAX_YES_SCALE).toBe(1.75);
  expect(MIN_NO_FACE_SCALE).toBe(0.5);

  const state = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
    yesScale: 99,
    noScale: -1,
  });
  expect(state.yesScale).toBe(MAX_YES_SCALE);
  expect(state.noScale).toBe(MIN_NO_FACE_SCALE);
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(INITIAL_TRICK_VISUAL_STATE)).toBe(true);
});
```

Add `MAX_YES_SCALE` and `MIN_NO_FACE_SCALE` to the existing `trick-state` import in `src/ui/trick-effects.test.ts`, then replace the Growing test with:

```ts
it("Growing Feelings animates from the prior absolute scales without exceeding safe YES", () => {
  const fixture = fakeEffectFixture();
  const result = TRICK_EFFECTS["growing-feelings"](fixture.context);

  expect(fixture.preview).toHaveBeenCalledWith({
    yesScale: MAX_YES_SCALE,
    noScale: MIN_NO_FACE_SCALE,
  });
  const yesAnimation = fixture.animationCalls.find(
    ({ element }) => element === fixture.elements.yesFace,
  )!;
  const noAnimation = fixture.animationCalls.find(
    ({ element }) => element === fixture.elements.noFace,
  )!;
  const yesFrames = keyframesOf(yesAnimation);
  const noFrames = keyframesOf(noAnimation);
  expect(Number(yesFrames[0]?.scale)).toBeCloseTo(
    result.preview.previous.yesScale / result.preview.target.yesScale,
  );
  expect(yesFrames.every(({ scale }) => Number(scale) <= 1)).toBe(true);
  expect(yesFrames).toContainEqual(expect.objectContaining({ offset: 0.55, scale: "1" }));
  expect(yesFrames.at(-1)?.scale).toBe("1");
  expect(Number(noFrames[0]?.scale)).toBeCloseTo(
    result.preview.previous.noScale / result.preview.target.noScale,
  );
  expect(noFrames).toContainEqual(expect.objectContaining({ offset: 0.55, scale: ".76" }));
  expect(noFrames.at(-1)?.scale).toBe("1");
  expect(yesAnimation.options.duration).toBe(650);
  expect(noAnimation.options.duration).toBe(650);
  expect(result.fallbackMs).toBe(850);
  expect(result.persistence).toBe("commit-target");
});
```

In the lifecycle table, change only the Growing row to:

```ts
[
  "growing-feelings",
  { yesScale: MAX_YES_SCALE, noScale: MIN_NO_FACE_SCALE },
  "commit-target",
  850,
],
```

In the desktop Growing E2E test, first move NO to a geometry-approved distant pose so the visual has room to demonstrate the stronger growth:

```ts
await forceTrickOrder(page, ["runaway-rsvp", "growing-feelings"]);
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/?to=Jamie");
await settleLetter(page);
await activateNoAndWait(page);
await page.locator("[data-yes]").focus();
```

Remove the test's old `forceTrickOrder(page, ["growing-feelings"])`, navigation, and initial YES-focus lines so the snippet above is the only setup. The test's existing later `activateNoAndWait(page)` now triggers Growing as the second trick. Strengthen its final assertions:

```ts
expect(after.yesScale).toBeGreaterThan(1.3);
expect(after.yesScale).toBeLessThanOrEqual(1.75);
expect(after.noScale).toBeCloseTo(0.5, 2);
expect(after.hitWidth).toBeGreaterThanOrEqual(44);
expect(after.hitHeight).toBeGreaterThanOrEqual(44);
```

The unit test above owns the exact `1.75` request. The browser first creates safe separation, then requires a visibly large result above `1.3` while still accepting a geometry-clamped value up to `1.75` if protected content limits the full scale.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- src/ui/trick-state.test.ts src/ui/trick-effects.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Growing enlarges"
```

Expected: unit assertions report the old `1.5`, `0.68`, `520`, or `700` values, and the browser assertion reports the old modest YES scale below `1.3` and NO scale above `0.50`.

- [ ] **Step 3: Implement the new state bounds and Growing timeline**

In `src/ui/trick-state.ts`, replace the constants with:

```ts
export const MAX_YES_SCALE = 1.75;
export const MIN_NO_FACE_SCALE = 0.5;
```

In `src/ui/trick-effects.ts`, import the constants:

```ts
import { MAX_YES_SCALE, MIN_NO_FACE_SCALE } from "./trick-state";
```

Replace the Growing effect with:

```ts
"growing-feelings": (context) => {
  const preview = context.preview({
    yesScale: MAX_YES_SCALE,
    noScale: MIN_NO_FACE_SCALE,
  });
  const yesStartScale = String(preview.previous.yesScale / preview.target.yesScale);
  const noStartScale = String(preview.previous.noScale / preview.target.noScale);
  context.animate(
    context.view.yesFace,
    [
      { scale: yesStartScale },
      { scale: "1", offset: 0.55 },
      { scale: ".96", offset: 0.78 },
      { scale: "1" },
    ],
    { duration: 650, easing: "ease-out", fill: "both" },
  );
  context.animate(
    context.view.noFace,
    [{ scale: noStartScale }, { scale: ".76", offset: 0.55 }, { scale: "1" }],
    { duration: 650, easing: "ease-out", fill: "both" },
  );
  return {
    message: "Funny—the feelings seem to be growing.",
    preview,
    fallbackMs: 850,
    persistence: "commit-target",
  };
},
```

- [ ] **Step 4: Run focused verification and confirm GREEN**

Run:

```powershell
npm test -- src/ui/trick-state.test.ts src/ui/trick-effects.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Growing enlarges"
npm run typecheck
```

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit the Growing increment**

```powershell
git add src/ui/trick-state.ts src/ui/trick-state.test.ts src/ui/trick-effects.ts src/ui/trick-effects.test.ts tests/e2e/trick-catalog.spec.ts
git commit -m "feat: amplify growing feelings trick"
```

### Task 2: Give Runaway RSVP a visibly farther two-hop arc

**Files:**
- Modify: `src/ui/trick-effects.test.ts:343-367,448-473,748-775`
- Modify: `src/ui/trick-effects.ts:81-123`

- [ ] **Step 1: Write failing Runaway arc and fallback expectations**

Replace the rotated-axis Runaway expectations with the approved offsets:

```ts
expect(keyframes[1]?.offset).toBe(0.32);
expectMotionInLetterAxes(
  transformAt(keyframes, 1),
  ROTATED_SAFE_POSE.rotation,
  { x: start.x * 0.78, y: start.y * 0.62 - 48 },
  (PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation) * 0.78,
);
expect(keyframes[2]?.offset).toBe(0.68);
expectMotionInLetterAxes(
  transformAt(keyframes, 2),
  ROTATED_SAFE_POSE.rotation,
  { x: start.x * 0.42, y: start.y * 0.28 - 30 },
  (PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation) * 0.42,
);
expectSettledMotion(transformAt(keyframes, -1));
expect(motion.options.duration).toBe(900);
expect(result.fallbackMs).toBe(1_100);
```

Add a no-pose fallback test immediately after it:

```ts
it("Runaway keeps the farther two-hop gesture when no safe pose exists", () => {
  const fixture = fakeEffectFixture({ pose: null });
  const result = TRICK_EFFECTS["runaway-rsvp"](fixture.context);
  const motion = fixture.animationCalls.find(
    ({ element }) => element === fixture.elements.noMotion,
  )!;
  const keyframes = keyframesOf(motion);

  expectMotionInLetterAxes(transformAt(keyframes, 1), 0, { x: -12, y: -18 }, -4);
  expectMotionInLetterAxes(transformAt(keyframes, 2), 0, { x: 12, y: -10 }, 4);
  expectSettledMotion(transformAt(keyframes, -1));
  expect(result.preview.target).toEqual(fixture.context.state);
});
```

Change the Runaway lifecycle-table fallback from `900` to `1_100`.

- [ ] **Step 2: Run the focused unit test and verify RED**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts -t "Runaway"
```

Expected: offsets, transforms, duration, fallback, and no-pose arc differ from the current smaller values.

- [ ] **Step 3: Implement the farther Runaway keyframes**

Replace the Runaway keyframes, duration, and fallback with:

```ts
const keyframes: Keyframe[] = posed
  ? [
      { transform: noMotionTransform(preview, start) },
      {
        offset: 0.32,
        transform: noMotionTransform(
          preview,
          { x: start.x * 0.78, y: start.y * 0.62 - 48 },
          rotationDelta * 0.78,
        ),
      },
      {
        offset: 0.68,
        transform: noMotionTransform(
          preview,
          { x: start.x * 0.42, y: start.y * 0.28 - 30 },
          rotationDelta * 0.42,
        ),
      },
      { transform: "translate(0, 0) rotate(0deg)" },
    ]
  : [
      { transform: noMotionTransform(preview, { x: 0, y: 0 }) },
      { transform: noMotionTransform(preview, { x: -12, y: -18 }, -4) },
      { transform: noMotionTransform(preview, { x: 12, y: -10 }, 4) },
      { transform: "translate(0, 0) rotate(0deg)" },
    ];
context.animate(context.view.noMotion, keyframes, {
  duration: 900,
  easing: "cubic-bezier(.2,.8,.2,1)",
  fill: "both",
});
return {
  message: "The NO button made a tiny two-hop escape.",
  preview,
  fallbackMs: 1_100,
  persistence: "commit-target",
};
```

- [ ] **Step 4: Run focused and spatial regression tests**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts src/ui/trick-geometry.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts tests/e2e/trick-geometry.spec.ts --project=desktop-chromium -g "runaway|persistent trick geometry"
```

Expected: the tuned unit tests pass, safe landing tests remain green, and no geometry case creates overflow or protected-content overlap.

- [ ] **Step 5: Commit the Runaway increment**

```powershell
git add src/ui/trick-effects.ts src/ui/trick-effects.test.ts
git commit -m "feat: extend runaway rsvp hops"
```

### Task 3: Extend Garden, Excuse, Spotlight, and Return stamp hold time

**Files:**
- Modify: `src/ui/trick-effects.test.ts:343-351,575-715,728-775`
- Modify: `tests/e2e/trick-helpers.ts:1-53`
- Modify: `tests/e2e/trick-catalog.spec.ts:1-8,262-330`
- Modify: `src/ui/trick-effects.ts:268-363,385-432`

- [ ] **Step 1: Write failing unit timing and hold-window tests**

Raise the registry fallback ceiling to the approved maximum:

```ts
expect(result.fallbackMs).toBeLessThanOrEqual(2_300);
```

In the Garden test, assert the stagger, duration, and hold offsets:

```ts
expect(fixture.animationCalls.map(({ options }) => options.delay)).toEqual([
  0, 45, 90, 135, 180, 225, 270, 315,
]);
for (const call of fixture.animationCalls) {
  const frames = keyframesOf(call);
  expect(call.options.duration).toBe(1_800);
  expect(frames[1]?.offset).toBe(0.25);
  expect(frames[1]?.opacity).toBe(1);
  expect(frames[2]?.offset).toBe(0.82);
  expect(frames[2]?.opacity).toBe(1);
}
expect(result.fallbackMs).toBe(2_300);
```

Update the existing Reduced Motion normal-delay expectation to:

```ts
expect(fullMotion.animationCalls.map(({ options }) => options.delay)).toEqual([
  0, 45, 90, 135, 180, 225, 270, 315,
]);
```

Add one table-driven unit test for the remaining three decorations:

```ts
it.each([
  ["dramatic-excuse", "trick-excuse", 1_800, 0.20, 0.84, 2_050],
  ["spotlight", "trick-spotlight-overlay", 1_900, 0.18, 0.50, 2_150],
  ["return-to-sender", "trick-return-stamp", 1_800, 0.22, 0.84, 2_050],
] as const)(
  "%s keeps its decoration through the approved hold window",
  (id, className, duration, visibleAt, heldThrough, fallbackMs) => {
    const fixture = fakeEffectFixture();
    const result = TRICK_EFFECTS[id](fixture.context);
    const artifact = fixture.trackedArtifacts.find((item) => item.className === className)!;
    const animation = fixture.animationCalls.find(({ element }) => element === artifact)!;
    const frames = keyframesOf(animation);

    expect(animation.options.duration).toBe(duration);
    expect(frames.some(({ offset, opacity }) => offset === visibleAt && opacity === 1)).toBe(true);
    expect(frames.some(({ offset, opacity }) => offset === heldThrough && opacity === 1)).toBe(true);
    expect(frames.at(-1)?.opacity).toBe(0);
    expect(result.fallbackMs).toBe(fallbackMs);
  },
);
```

Update the lifecycle table rows to:

```ts
["yes-garden", {}, "transient", 2_300],
["dramatic-excuse", {}, "transient", 2_050],
["spotlight", {}, "transient", 2_150],
["return-to-sender", { noPose: SAFE_POSE }, "commit-target", 2_050],
```

- [ ] **Step 2: Add deterministic browser animation-seeking helpers**

Append this code near the top of `tests/e2e/trick-helpers.ts`, after `capturePageErrors`:

```ts
export interface TrickAnimationTiming {
  readonly count: number;
  readonly maxDuration: number;
}

export async function seekTrickAnimations(
  page: Page,
  progress: number,
): Promise<TrickAnimationTiming> {
  await page.waitForFunction(() => document.getAnimations().some((animation) => {
    if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition) return false;
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    return target instanceof Element && Boolean(target.closest([
      "[data-trick-artifact]",
      "[data-no-motion]",
      "[data-no-face]",
      "[data-no-label]",
      "[data-yes-face]",
    ].join(", ")));
  }));

  return page.evaluate((fraction) => {
    const durations: number[] = [];
    for (const animation of document.getAnimations()) {
      if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition) continue;
      const effect = animation.effect instanceof KeyframeEffect ? animation.effect : null;
      const target = effect?.target;
      if (!(target instanceof Element) || !target.closest([
        "[data-trick-artifact]",
        "[data-no-motion]",
        "[data-no-face]",
        "[data-no-label]",
        "[data-yes-face]",
      ].join(", "))) continue;
      const timing = effect.getTiming();
      if (typeof timing.duration !== "number") continue;
      animation.pause();
      animation.currentTime = Number(timing.delay) + timing.duration * fraction;
      durations.push(timing.duration);
    }
    return {
      count: durations.length,
      maxDuration: durations.length === 0 ? 0 : Math.max(...durations),
    };
  }, progress);
}

export async function resumeTrickAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.playState !== "paused") continue;
      if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition) continue;
      const effect = animation.effect instanceof KeyframeEffect ? animation.effect : null;
      const target = effect?.target;
      if (!(target instanceof Element) || !target.closest([
        "[data-trick-artifact]",
        "[data-no-motion]",
        "[data-no-face]",
        "[data-no-label]",
        "[data-yes-face]",
      ].join(", "))) continue;
      animation.play();
    }
  });
}
```

- [ ] **Step 3: Write failing browser hold-and-cleanup coverage**

Add `resumeTrickAnimations` and `seekTrickAnimations` to the helper import in `tests/e2e/trick-catalog.spec.ts`, then add:

```ts
test.describe("long-lived decorative tricks", () => {
  const cases = [
    ["yes-garden", ".trick-garden-item", 8, 1_800],
    ["dramatic-excuse", ".trick-excuse", 1, 1_800],
    ["spotlight", ".trick-spotlight-overlay", 1, 1_900],
    ["return-to-sender", ".trick-return-stamp", 1, 1_800],
  ] as const satisfies readonly (readonly [TrickId, string, number, number])[];

  for (const [id, selector, count, minimumDuration] of cases) {
    test(`${id} holds its decoration before eventual cleanup`, async ({ page }) => {
      await forceTrickOrder(page, [id]);
      await page.goto("/?to=Jamie");
      await settleLetter(page);

      await page.locator("[data-no]").click();
      const timing = await seekTrickAnimations(page, 0.55);
      expect(timing.maxDuration).toBeGreaterThanOrEqual(minimumDuration);
      await expect(page.locator(selector)).toHaveCount(count);
      await expect.poll(async () => Number.parseFloat(await page.locator(selector).first().evaluate(
        (element) => getComputedStyle(element).opacity,
      ))).toBeGreaterThan(0.5);

      await resumeTrickAnimations(page);
      await waitForTrickIdle(page);
      await expect(page.locator(selector)).toHaveCount(0);
      await expect(page.locator("[data-trick-artifact]")).toHaveCount(0);
    });
  }
});
```

- [ ] **Step 4: Run unit and browser tests and verify RED**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "holds its decoration"
```

Expected: the old `700`–`900ms` durations, old offsets, old fallbacks, and old stagger fail the new assertions.

- [ ] **Step 5: Implement the longer Garden timeline**

Replace Garden's animation frames and options with:

```ts
const bloomTransform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`;
context.animate(
  item,
  [
    { opacity: 0, transform: "translate(-50%, -50%) scale(.2)" },
    { opacity: 1, offset: 0.25, transform: bloomTransform },
    { opacity: 1, offset: 0.82, transform: bloomTransform },
    {
      opacity: 0,
      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y - 12}px)) scale(.9)`,
    },
  ],
  {
    duration: 1_800,
    delay: context.reducedMotion ? 0 : index * 45,
    easing: "ease-out",
    fill: "both",
  },
);
```

Set Garden's `fallbackMs` to `2_300`.

- [ ] **Step 6: Implement the longer Excuse and Spotlight timelines**

Replace Dramatic Excuse's animation with:

```ts
context.animate(
  bubble,
  [
    { opacity: 0, transform: "translate(-50%, 8px)", scale: ".8" },
    { opacity: 1, transform: "translate(-50%, -100%)", scale: "1", offset: 0.20 },
    { opacity: 1, transform: "translate(-50%, -100%)", scale: "1", offset: 0.84 },
    { opacity: 0, transform: "translate(-50%, -110%)", scale: ".96" },
  ],
  { duration: 1_800, easing: "ease-out", fill: "both" },
);
```

Set its `fallbackMs` to `2_050`.

Replace Spotlight's animation with:

```ts
context.animate(
  overlay,
  [
    { opacity: 0 },
    { opacity: 1, offset: 0.18 },
    { opacity: 1, offset: 0.50 },
    { opacity: 0.65, offset: 0.74 },
    { opacity: 0.28, offset: 0.90 },
    { opacity: 0 },
  ],
  { duration: 1_900, easing: "ease-in-out", fill: "both" },
);
```

Set its `fallbackMs` to `2_150`.

- [ ] **Step 7: Implement the longer Return stamp without slowing NO travel**

Keep the existing `900ms` `noMotion` animation. Replace only the stamp animation and effect fallback:

```ts
context.animate(
  stamp,
  [
    { opacity: 0, rotate: "-15deg", scale: "1.8" },
    { opacity: 1, rotate: "-8deg", scale: "1", offset: 0.22 },
    { opacity: 1, rotate: "-8deg", scale: "1", offset: 0.84 },
    { opacity: 0, rotate: "-8deg", scale: "1" },
  ],
  { duration: 1_800, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
);
```

Set Return to Sender's `fallbackMs` to `2_050`.

- [ ] **Step 8: Run focused verification and confirm GREEN**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts src/ui/trick-runner.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Garden|Dramatic|Spotlight|Return|holds its decoration"
npm run typecheck
```

Expected: unit, lifecycle, deterministic hold, semantic Spotlight, cleanup, and type tests pass.

- [ ] **Step 9: Commit the longer decorative timelines**

```powershell
git add src/ui/trick-effects.ts src/ui/trick-effects.test.ts tests/e2e/trick-helpers.ts tests/e2e/trick-catalog.spec.ts
git commit -m "feat: extend decorative trick holds"
```

### Task 4: Rebuild Paper Plane as direction-aware two-step origami

**Files:**
- Modify: `src/ui/trick-effects.test.ts:114-116,260-323,435-446,532-552,748-788`
- Modify: `tests/e2e/trick-catalog.spec.ts:97-161`
- Modify: `src/ui/trick-effects.ts:9-24,69-78,214-266`
- Modify: `src/styles/tricks.css:28-29,92-139`

- [ ] **Step 1: Add failing Paper Plane unit helpers and direction cases**

Add a left landing fixture near the existing pose constants:

```ts
const LEFT_SAFE_POSE: NoPose = Object.freeze({ centerX: 250, centerY: 500, rotation: 5 });
```

Add this test helper after `transformAt`:

```ts
function polygonPointCount(value: unknown): number {
  const match = String(value).match(/^polygon\((.*)\)$/);
  if (!match) throw new Error(`Expected polygon clip path, received: ${String(value)}`);
  return match[1]!.split(",").length;
}

function letterAxesDelta(transform: string, targetRotation: number): Point {
  const local = parseMotionTransform(transform);
  return rotateVector(local, targetRotation);
}
```

Replace the basic Paper Plane ownership test with:

```ts
it("Paper Plane owns two crease layers and folds before direction-aware flight", () => {
  const fixture = fakeEffectFixture();
  const result = TRICK_EFFECTS["paper-plane"](fixture.context);

  expect(fixture.choosePose).toHaveBeenCalledWith("plane");
  expect(fixture.trackArtifact).toHaveBeenCalledOnce();
  const [fold] = fixture.trackedArtifacts;
  expect(fold?.className).toBe("trick-plane-fold");
  expect(fold?.getAttribute("aria-hidden")).toBe("true");
  expect(fixture.elements.noFace.children).toContain(fold);
  expect(fold?.children.map(({ className }) => className)).toEqual([
    "trick-plane-crease trick-plane-crease--one",
    "trick-plane-crease trick-plane-crease--two",
  ]);
  const [creaseOne, creaseTwo] = fold!.children;

  const motion = fixture.animationCalls.find(({ element }) => element === fixture.elements.noMotion)!;
  const face = fixture.animationCalls.find(({ element }) => element === fixture.elements.noFace)!;
  const label = fixture.animationCalls.find(({ element }) => element === fixture.elements.noLabel)!;
  const motionFrames = keyframesOf(motion);
  const faceFrames = keyframesOf(face);
  const labelFrames = keyframesOf(label);
  expect(faceFrames.every(({ clipPath }) => polygonPointCount(clipPath) === 4)).toBe(true);
  expect(motionFrames[1]?.offset).toBe(0.30);
  expect(transformAt(motionFrames, 1)).toBe(transformAt(motionFrames, 0));
  expect(motionFrames[3]?.offset).toBe(0.80);
  expectSettledMotion(transformAt(motionFrames, 3));
  expectSettledMotion(transformAt(motionFrames, -1));
  expect(faceFrames[1]).toMatchObject({
    offset: 0.16,
    clipPath: "polygon(0 14%, 100% 0, 100% 100%, 0 86%)",
  });
  expect(faceFrames[2]?.offset).toBe(0.30);
  expect(faceFrames[3]?.offset).toBe(0.80);
  expect(faceFrames[2]?.clipPath).toBe("polygon(0 0, 100% 50%, 0 100%, 24% 50%)");
  expect(faceFrames[1]?.clipPath).not.toBe(faceFrames[2]?.clipPath);
  expect(faceFrames.at(-1)).toMatchObject({
    clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
    borderRadius: "999px",
    rotate: "0deg",
    scale: "1",
  });
  expect(labelFrames[1]?.opacity).toBe(0);
  expect(labelFrames.at(-1)).toMatchObject({ opacity: 1, scale: "1" });
  const creaseAnimations = [creaseOne, creaseTwo].map((crease) => (
    fixture.animationCalls.find(({ element }) => element === crease)!
  ));
  expect(keyframesOf(creaseAnimations[0]!)[1]).toMatchObject({ offset: 0.18, opacity: 1 });
  expect(keyframesOf(creaseAnimations[1]!)[2]).toMatchObject({ offset: 0.30, opacity: 1 });
  for (const creaseAnimation of creaseAnimations) {
    expect(creaseAnimation.options.duration).toBe(1_500);
    expect(keyframesOf(creaseAnimation).at(-1)).toMatchObject({
      opacity: 0,
      rotate: "0deg",
    });
  }
  expect(motion.options.duration).toBe(1_500);
  expect(face.options.duration).toBe(1_500);
  expect(label.options.duration).toBe(1_500);
  expect(result.fallbackMs).toBe(1_750);
  expect(result.preview.target.noPose).toEqual(SAFE_POSE);
});
```

Add explicit right/left direction coverage:

```ts
it.each([
  ["right", SAFE_POSE, 1, "polygon(0 0, 100% 50%, 0 100%, 24% 50%)"],
  ["left", LEFT_SAFE_POSE, -1, "polygon(100% 0, 0 50%, 100% 100%, 76% 50%)"],
] as const)("Paper Plane points %s along its actual flight", (_name, pose, direction, polygon) => {
  const fixture = fakeEffectFixture({ pose });
  const result = TRICK_EFFECTS["paper-plane"](fixture.context);
  const start = centerDelta(result.preview.beforeNo, result.preview.afterNo);
  const motion = fixture.animationCalls.find(({ element }) => element === fixture.elements.noMotion)!;
  const face = fixture.animationCalls.find(({ element }) => element === fixture.elements.noFace)!;

  const motionFrames = keyframesOf(motion);
  expect(keyframesOf(face)[2]?.clipPath).toBe(polygon);
  expectMotionInLetterAxes(
    transformAt(motionFrames, 2),
    pose.rotation,
    { x: start.x * 0.42, y: start.y * 0.36 - 96 },
  );
  const horizontal = motionFrames.map((_, index) => (
    letterAxesDelta(transformAt(motionFrames, index), pose.rotation).x
  ));
  for (let index = 1; index < horizontal.length; index += 1) {
    expect(direction * (horizontal[index]! - horizontal[index - 1]!))
      .toBeGreaterThanOrEqual(-1e-6);
  }
  expectSettledMotion(transformAt(motionFrames, -1));
});
```

Replace the existing rotated-seat Paper Plane test so it targets the new delayed arc rather than the obsolete frame index:

```ts
it("Paper Plane converts its delayed arc into rotated target-seat axes", () => {
  const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, noPose: PREVIOUS_ROTATED_POSE });
  const fixture = fakeEffectFixture({ state, pose: ROTATED_SAFE_POSE });
  const result = TRICK_EFFECTS["paper-plane"](fixture.context);
  const motion = fixture.animationCalls.find(
    ({ element }) => element === fixture.elements.noMotion,
  )!;
  const frames = keyframesOf(motion);
  const start = centerDelta(result.preview.beforeNo, result.preview.afterNo);
  const rotationDelta = PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation;
  const direction = 1;

  expectMotionInLetterAxes(
    transformAt(frames, 0),
    ROTATED_SAFE_POSE.rotation,
    start,
    rotationDelta,
  );
  expect(frames[1]?.offset).toBe(0.30);
  expect(transformAt(frames, 1)).toBe(transformAt(frames, 0));
  expectMotionInLetterAxes(
    transformAt(frames, 2),
    ROTATED_SAFE_POSE.rotation,
    { x: start.x * 0.42, y: start.y * 0.36 - 96 },
    rotationDelta * 0.38 - direction * 18,
  );
  expect(frames[3]?.offset).toBe(0.80);
  expectSettledMotion(transformAt(frames, 3));
  expectSettledMotion(transformAt(frames, -1));
});
```

Update the lifecycle-table Paper Plane fallback to `1_750`.

- [ ] **Step 2: Write the failing Paper Plane browser test**

Add this E2E test after the spatial-trick block, reusing the animation helpers introduced in Task 3:

```ts
test("Paper Plane folds before flight without changing NO semantics", async ({ page }) => {
  await forceTrickOrder(page, ["paper-plane"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?to=Jamie");
  await settleLetter(page);

  const no = page.locator("[data-no]");
  await no.click();
  const timing = await seekTrickAnimations(page, 0.50);
  expect(timing.maxDuration).toBeGreaterThanOrEqual(1_500);
  await expect(page.locator(".trick-plane-fold[data-trick-artifact]")).toBeAttached();
  await expect(page.locator(".trick-plane-crease")).toHaveCount(2);
  await expect.poll(async () => Number.parseFloat(await page.locator("[data-no-label]").evaluate(
    (label) => getComputedStyle(label).opacity,
  ))).toBeLessThan(0.1);
  await expect(page.getByRole("button", { name: /NO, SORRY/i })).toBeVisible();

  await resumeTrickAnimations(page);
  await waitForTrickIdle(page);
  await expect(page.locator(".trick-plane-fold")).toHaveCount(0);
  await expect(page.locator("[data-trick-artifact]")).toHaveCount(0);
});
```

- [ ] **Step 3: Run Paper Plane tests and verify RED**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts -t "Paper Plane"
npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Paper Plane folds"
```

Expected: the current effect has no crease artifact, uses incompatible `inset()`/`polygon()` shapes, has no left-facing variant, starts flight too early, and lasts only `1000ms`.

- [ ] **Step 4: Add Paper Plane direction and polygon helpers**

Add these helpers above `TRICK_EFFECTS` in `src/ui/trick-effects.ts`:

```ts
type PlaneDirection = -1 | 1;

const RIGHT_BUTTON_CLIP = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
const LEFT_BUTTON_CLIP = "polygon(100% 0, 0 0, 0 100%, 100% 100%)";

function buttonClip(direction: PlaneDirection): string {
  return direction === 1 ? RIGHT_BUTTON_CLIP : LEFT_BUTTON_CLIP;
}

function planeDirection(preview: VisualPreview): PlaneDirection {
  return centerOf(preview.afterNo).x < centerOf(preview.beforeNo).x ? -1 : 1;
}

function firstFoldClip(direction: PlaneDirection): string {
  return direction === 1
    ? "polygon(0 14%, 100% 0, 100% 100%, 0 86%)"
    : "polygon(100% 14%, 0 0, 0 100%, 100% 86%)";
}

function planeClip(direction: PlaneDirection): string {
  return direction === 1
    ? "polygon(0 0, 100% 50%, 0 100%, 24% 50%)"
    : "polygon(100% 0, 0 50%, 100% 100%, 76% 50%)";
}

function createPlaneFold(context: TrickEffectContext): {
  readonly fold: HTMLElement;
  readonly creaseOne: HTMLElement;
  readonly creaseTwo: HTMLElement;
} {
  const fold = ownedArtifact(context, "trick-plane-fold");
  const creaseOne = context.view.letter.ownerDocument.createElement("span");
  const creaseTwo = context.view.letter.ownerDocument.createElement("span");
  creaseOne.className = "trick-plane-crease trick-plane-crease--one";
  creaseTwo.className = "trick-plane-crease trick-plane-crease--two";
  fold.append(creaseOne, creaseTwo);
  context.view.noFace.append(fold);
  return { fold, creaseOne, creaseTwo };
}
```

- [ ] **Step 5: Replace Paper Plane with the approved two-step fold**

Replace the complete `paper-plane` effect with:

```ts
"paper-plane": (context) => {
  const { preview, posed } = choosePosePreview(context, "plane");
  const start = centerDelta(preview.beforeNo, preview.afterNo);
  const rotationDelta = noMotionRotationDelta(preview);
  const direction = planeDirection(preview);
  const openClip = buttonClip(direction);
  const foldClip = firstFoldClip(direction);
  const foldedClip = planeClip(direction);
  const { creaseOne, creaseTwo } = createPlaneFold(context);
  const options: KeyframeAnimationOptions = {
    duration: 1_500,
    easing: "cubic-bezier(.3,.1,.2,1)",
    fill: "both",
  };

  const motionKeyframes: Keyframe[] = posed
    ? [
        { opacity: 1, offset: 0, transform: noMotionTransform(preview, start) },
        { opacity: 1, offset: 0.30, transform: noMotionTransform(preview, start) },
        {
          opacity: 1,
          offset: 0.68,
          transform: `${noMotionTransform(
            preview,
            { x: start.x * 0.42, y: start.y * 0.36 - 96 },
            rotationDelta * 0.38 - direction * 18,
          )} scale(.62)`,
        },
        {
          opacity: 1,
          offset: 0.80,
          transform: "translate(0, 0) rotate(0deg) scale(1)",
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ]
    : [
        { opacity: 1, offset: 0, transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        { opacity: 1, offset: 0.30, transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        {
          opacity: 1,
          offset: 0.68,
          transform: `${noMotionTransform(preview, { x: 0, y: -36 })} scale(.72)`,
        },
        {
          opacity: 1,
          offset: 0.80,
          transform: "translate(0, 0) rotate(0deg) scale(1)",
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ];

  context.animate(context.view.noMotion, motionKeyframes, options);
  context.animate(
    context.view.noFace,
    [
      { clipPath: openClip, borderRadius: "999px", rotate: "0deg", scale: "1", offset: 0 },
      { clipPath: foldClip, borderRadius: "5px", rotate: `${direction * -4}deg`, scale: ".94", offset: 0.16 },
      { clipPath: foldedClip, borderRadius: "0", rotate: `${direction * -12}deg`, scale: ".78", offset: 0.30 },
      { clipPath: foldedClip, borderRadius: "0", rotate: `${direction * 3}deg`, scale: ".78", offset: 0.80 },
      { clipPath: foldClip, borderRadius: "5px", rotate: "0deg", scale: ".94", offset: 0.90 },
      { clipPath: openClip, borderRadius: "999px", rotate: "0deg", scale: "1", offset: 1 },
    ],
    options,
  );
  context.animate(
    context.view.noLabel,
    [
      { opacity: 1, scale: "1", offset: 0 },
      { opacity: 0, scale: ".2 1", offset: 0.28 },
      { opacity: 0, scale: ".2 1", offset: 0.82 },
      { opacity: 1, scale: "1", offset: 1 },
    ],
    options,
  );
  context.animate(
    creaseOne,
    [
      { opacity: 0, rotate: "0deg", offset: 0 },
      { opacity: 1, rotate: `${direction * 24}deg`, offset: 0.18 },
      { opacity: 1, rotate: `${direction * 24}deg`, offset: 0.80 },
      { opacity: 0, rotate: "0deg", offset: 0.90 },
      { opacity: 0, rotate: "0deg", offset: 1 },
    ],
    options,
  );
  context.animate(
    creaseTwo,
    [
      { opacity: 0, rotate: "0deg", offset: 0 },
      { opacity: 0, rotate: "0deg", offset: 0.22 },
      { opacity: 1, rotate: `${direction * -24}deg`, offset: 0.30 },
      { opacity: 1, rotate: `${direction * -24}deg`, offset: 0.80 },
      { opacity: 0, rotate: "0deg", offset: 0.90 },
      { opacity: 0, rotate: "0deg", offset: 1 },
    ],
    options,
  );

  return {
    message: "NO folded into a paper plane and landed somewhere safe.",
    preview,
    fallbackMs: 1_750,
    persistence: "commit-target",
  };
},
```

- [ ] **Step 6: Style only the runner-owned crease layer**

Expand the existing NO face rule and add the fold styles in `src/styles/tricks.css`:

```css
.desk [data-no-face] {
  position: relative;
  transform: scale(var(--no-scale, 1));
}

.trick-plane-fold {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  border-radius: inherit;
  color: #9b6570;
  pointer-events: none;
}

.trick-plane-crease {
  position: absolute;
  top: 50%;
  left: 18%;
  width: 64%;
  border-top: 1px solid currentColor;
  opacity: 0;
  transform-origin: center;
}
```

Keep `.trick-plane-fold` out of the global absolutely-positioned letter-artifact group because it is positioned relative to `noFace`, not the letter.

- [ ] **Step 7: Run Paper Plane unit, browser, Reduced Motion, and cleanup verification**

Run:

```powershell
npm test -- src/ui/trick-effects.test.ts src/ui/trick-runner.test.ts
npx playwright test tests/e2e/trick-catalog.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/choice-flows.spec.ts --project=desktop-chromium -g "Paper Plane|paper-plane|Reduced Motion|YES during a busy trick|clears trick visuals"
npm run typecheck
```

Expected: right/left direction, fold stages, semantic name, Reduced Motion completion, YES cancellation, result cleanup, and type checking all pass.

- [ ] **Step 8: Commit the Paper Plane increment**

```powershell
git add src/ui/trick-effects.ts src/ui/trick-effects.test.ts src/styles/tricks.css tests/e2e/trick-catalog.spec.ts
git commit -m "feat: rebuild paper plane fold"
```

### Task 5: Run the complete release gate and inspect the final branch

**Files:**
- Verify: all files changed in Tasks 1–4

- [ ] **Step 1: Run every unit, browser, type, and production-build check**

Run:

```powershell
npm run check
```

Expected:

- Vitest: all unit tests pass with zero failures.
- Playwright: all applicable desktop/mobile tests pass; only the repository's intentional project/live-smoke skips remain.
- TypeScript: `tsc --noEmit` exits `0`.
- Vite: production build exits `0` and writes `dist/` without tracked build output.

- [ ] **Step 2: Verify repository hygiene and scope**

Run:

```powershell
git diff --check main...HEAD
git status --short
git log --oneline --decorate main..HEAD
```

Expected: `git diff --check` is silent, `git status --short` is empty, and branch history contains the design/plan commits plus the four atomic implementation commits from Tasks 1–4.

- [ ] **Step 3: Review the final diff against all seven user requests**

Run:

```powershell
git diff --stat main...HEAD
git diff main...HEAD -- src/ui/trick-state.ts src/ui/trick-effects.ts src/styles/tricks.css
```

Expected: the final source diff contains only the approved scale, hop, hold, fade, stamp, and direction-aware origami changes; there are no URL, Calendar, Telegram, maker, refusal-threshold, or unrelated layout edits.

- [ ] **Step 4: Do not create an empty verification commit**

If Step 1–3 leave the worktree clean, preserve the existing atomic history. If verification exposes a defect, return to the responsible task, add a failing regression test, implement the smallest fix, rerun `npm run check`, and commit that tested fix with a scoped `fix:` message.
